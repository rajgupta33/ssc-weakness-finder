import express from "express";
import {
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { query, transaction } from "./db.js";
import { seedBase } from "./seed.js";
import { DIAGNOSTIC, MODULES } from "./config.js";
import { safeQuestion, readiness, scoreAttempt } from "./logic.js";
import { seedQuestionBank, publishBank } from "./bank.js";

export const app = express();
app.disable("x-powered-by");
if (process.env.VERCEL) app.set("trust proxy", 1);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

const fail = (res, status, message) =>
  res.status(status).json({ error: message });
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const now = () => new Date().toISOString();
const attemptRows = async (run, id) =>
  (
    await run(
      `SELECT aq.question_id,aq.position,aq.snapshot,r.selected_option,r.marked_for_review,r.visited,r.answered_at FROM attempt_questions aq JOIN responses r ON r.attempt_id=aq.attempt_id AND r.question_id=aq.question_id WHERE aq.attempt_id=$1 ORDER BY aq.position`,
      [id],
    )
  ).rows.map((row) => ({ ...row, ...row.snapshot }));
const formRows = async () =>
  (
    await query(
      `SELECT q.*,dq.display_order AS position FROM diagnostic_questions dq JOIN questions q ON q.id=dq.question_id WHERE dq.diagnostic_id=$1 ORDER BY dq.display_order`,
      [DIAGNOSTIC.id],
    )
  ).rows;
function tokenOk(req, attempt) {
  const token = req.get("x-attempt-token") || "";
  return (
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(attempt.access_token))
  );
}
async function ownedAttempt(req, res) {
  const attempt = (
    await query("SELECT * FROM attempts WHERE id=$1", [req.params.id])
  ).rows[0];
  if (!attempt || !tokenOk(req, attempt)) {
    fail(res, 404, "Attempt not found.");
    return null;
  }
  return attempt;
}
function signedAdmin() {
  const secret = process.env.SESSION_SECRET || "";
  const value = `admin.${Math.floor(Date.now() / 1000) + 86400}`;
  return `${value}.${createHmac("sha256", secret).update(value).digest("hex")}`;
}
function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return false;
  const raw =
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("ssc_admin="))
      ?.slice(10) || "";
  const match = /^(admin\.\d+)\.([a-f0-9]{64})$/.exec(raw);
  if (!match || Number(match[1].split(".")[1]) < Date.now() / 1000)
    return false;
  const expected = createHmac("sha256", process.env.SESSION_SECRET)
    .update(match[1])
    .digest("hex");
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected));
}
const admin = (req, res, next) =>
  isAdmin(req) ? next() : fail(res, 401, "Admin sign in required.");

app.get(
  "/api/diagnostic",
  asyncRoute(async (req, res) => {
    const state = readiness(await formRows());
    res.json({
      diagnostic: DIAGNOSTIC,
      ready: state.ready,
      setup_message: state.ready
        ? null
        : "The question bank is being verified. This diagnostic is not yet open.",
    });
  }),
);
app.post(
  "/api/attempts",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many new attempts. Please try again in 15 minutes.",
    },
  }),
  asyncRoute(async (req, res) => {
    const name = String(req.body?.student_name || "").trim();
    if (!/^[\p{L}\p{M} .'-]{2,60}$/u.test(name))
      return fail(res, 400, "Enter a name of 2–60 characters.");
    const form = await formRows();
    if (!readiness(form).ready)
      return fail(
        res,
        503,
        "The diagnostic is not ready. Exactly 20 verified questions are required.",
      );
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    await transaction(async (run) => {
      await run(
        `INSERT INTO attempts(id,diagnostic_id,student_name,status,started_at,access_token) VALUES($1,$2,$3,'in_progress',$4,$5)`,
        [id, DIAGNOSTIC.id, name, now(), token],
      );
      for (const q of form) {
        const snapshot = { ...q };
        delete snapshot.position;
        await run(
          "INSERT INTO attempt_questions(attempt_id,question_id,position,snapshot) VALUES($1,$2,$3,$4)",
          [id, q.id, q.position, JSON.stringify(snapshot)],
        );
        await run(
          "INSERT INTO responses(attempt_id,question_id) VALUES($1,$2)",
          [id, q.id],
        );
      }
    });
    res
      .status(201)
      .json({
        attempt_id: id,
        access_token: token,
        student_name: name,
        questions: form.map(safeQuestion),
      });
  }),
);
app.get(
  "/api/attempts/:id",
  asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === "submitted")
      return res.json({
        status: "submitted",
        result_url: `/result.html?id=${attempt.id}`,
      });
    const rows = await attemptRows(query, attempt.id);
    res.json({
      status: attempt.status,
      student_name: attempt.student_name,
      questions: rows.map(safeQuestion),
      responses: rows.map((x) => ({
        question_id: x.question_id,
        selected_option: x.selected_option,
        marked_for_review: x.marked_for_review,
        visited: x.visited,
      })),
    });
  }),
);
app.put(
  "/api/attempts/:id/responses",
  asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== "in_progress")
      return fail(res, 409, "Submitted attempts are locked.");
    const { question_id, selected_option, marked_for_review, visited } =
      req.body || {};
    if (!question_id || ![null, "A", "B", "C", "D"].includes(selected_option))
      return fail(res, 400, "Invalid response.");
    if (typeof marked_for_review !== "boolean" || typeof visited !== "boolean")
      return fail(res, 400, "Invalid response flags.");
    const outcome = await transaction(async (run) => {
      const locked = (
        await run("SELECT status FROM attempts WHERE id=$1 FOR UPDATE", [
          attempt.id,
        ])
      ).rows[0];
      if (locked.status !== "in_progress") return "locked";
      const result = await run(
        `UPDATE responses SET selected_option=$1,marked_for_review=$2,visited=$3,answered_at=CASE WHEN $1::text IS NULL THEN answered_at ELSE $4 END WHERE attempt_id=$5 AND question_id=$6 RETURNING question_id`,
        [
          selected_option,
          marked_for_review,
          visited,
          now(),
          attempt.id,
          question_id,
        ],
      );
      if (!result.rows.length) return "missing";
      if (selected_option)
        await run(
          "UPDATE attempts SET first_answered_at=COALESCE(first_answered_at,$1) WHERE id=$2",
          [now(), attempt.id],
        );
      return "saved";
    });
    if (outcome === "locked")
      return fail(res, 409, "Submitted attempts are locked.");
    if (outcome === "missing")
      return fail(res, 404, "Question not in attempt.");
    res.json({ saved: true });
  }),
);
app.post(
  "/api/attempts/:id/submit",
  asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === "submitted")
      return res.json({
        submitted: true,
        result_url: `/result.html?id=${attempt.id}`,
      });
    await transaction(async (run) => {
      const lock = (
        await run("SELECT status FROM attempts WHERE id=$1 FOR UPDATE", [
          attempt.id,
        ])
      ).rows[0];
      if (lock.status === "submitted") return;
      const items = await attemptRows(run, attempt.id);
      const result = scoreAttempt(items);
      for (const row of result.scored)
        await run(
          "UPDATE responses SET is_correct=$1,points=$2 WHERE attempt_id=$3 AND question_id=$4",
          [row.is_correct, row.points, attempt.id, row.question_id],
        );
      await run(
        `UPDATE attempts SET status='submitted',submitted_at=$1,score=$2,accuracy=$3,correct_count=$4,incorrect_count=$5,unattempted_count=$6 WHERE id=$7`,
        [
          now(),
          result.score,
          result.accuracy,
          result.correct,
          result.incorrect,
          result.unattempted,
          attempt.id,
        ],
      );
    });
    res.json({ submitted: true, result_url: `/result.html?id=${attempt.id}` });
  }),
);
app.get(
  "/api/attempts/:id/result",
  asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== "submitted")
      return fail(res, 409, "Result is available after submission.");
    const result = scoreAttempt(await attemptRows(query, attempt.id));
    const { scored, ...summary } = result;
    res.json({
      student_name: attempt.student_name,
      submitted_at: attempt.submitted_at,
      ...summary,
    });
  }),
);
app.get(
  "/api/attempts/:id/review",
  asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== "submitted")
      return fail(res, 409, "Review is available after submission.");
    const scored = scoreAttempt(await attemptRows(query, attempt.id)).scored;
    res.json({
      student_name: attempt.student_name,
      questions: scored.map((x) => ({
        position: x.position,
        question_code: x.question_code,
        prompt: x.prompt,
        options: { A: x.option_a, B: x.option_b, C: x.option_c, D: x.option_d },
        selected_option: x.selected_option,
        correct_option: x.correct_option,
        is_correct: x.is_correct,
        explanation: x.explanation,
        rule_summary: x.rule_summary,
        module_code: x.primary_module_code,
        module_name: MODULES.find((m) => m.code === x.primary_module_code)
          ?.name,
        sub_module: x.sub_module,
        exam_name: x.exam_name,
        exam_year: x.exam_year,
        exam_date: x.exam_date,
        shift: x.shift,
        source_url: x.source_url,
      })),
    });
  }),
);
app.post(
  "/api/admin/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many sign in attempts. Please try again in 15 minutes.",
    },
  }),
  (req, res) => {
    const secret = process.env.ADMIN_PASSWORD || "";
    const supplied = String(req.body?.password || "");
    if (
      !secret ||
      !process.env.SESSION_SECRET ||
      !timingSafeEqual(
        createHash("sha256").update(supplied).digest(),
        createHash("sha256").update(secret).digest(),
      )
    )
      return fail(res, 401, "Invalid admin password.");
    res.setHeader(
      "Set-Cookie",
      `ssc_admin=${signedAdmin()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    res.json({ ok: true });
  },
);
app.post("/api/admin/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    "ssc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/admin/me", (req, res) =>
  res.json({ authenticated: isAdmin(req) }),
);
app.get(
  "/api/admin/questions",
  admin,
  asyncRoute(async (req, res) => {
    const form = await formRows();
    const rows = (
      await query(
        "SELECT * FROM questions ORDER BY display_order,question_code",
      )
    ).rows;
    res.json({
      readiness: readiness(form),
      questions: rows.map((q) => ({
        ...q,
        position: q.display_order,
        module_code: q.primary_module_code,
        options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      })),
    });
  }),
);
app.post(
  "/api/admin/questions/publish",
  admin,
  asyncRoute(async (req, res) => {
    const reviewer = String(req.body?.reviewer || "").trim();
    if (
      req.body?.approved !== true ||
      reviewer.length < 2 ||
      reviewer.length > 60
    )
      return fail(
        res,
        400,
        "Confirm source and answer verification and enter your name.",
      );
    try {
      res.json(await publishBank(reviewer));
    } catch (error) {
      return fail(res, 400, error.message);
    }
  }),
);
app.get(
  "/api/admin/attempts",
  admin,
  asyncRoute(async (req, res) => {
    const rows = (
      await query(
        `SELECT id,student_name,started_at,submitted_at,status,score,accuracy FROM attempts ORDER BY started_at DESC LIMIT 100`,
      )
    ).rows;
    const attempts = [];
    for (const row of rows) {
      let weakest_module = null;
      if (row.status === "submitted")
        weakest_module =
          scoreAttempt(await attemptRows(query, row.id)).weakAreas[0]?.name ||
          null;
      attempts.push({ ...row, weakest_module });
    }
    res.json({ attempts });
  }),
);
app.get(
  "/api/admin/attempts/:id",
  admin,
  asyncRoute(async (req, res) => {
    const row = (
      await query("SELECT * FROM attempts WHERE id=$1", [req.params.id])
    ).rows[0];
    if (!row) return fail(res, 404, "Attempt not found.");
    const items = await attemptRows(query, row.id);
    res.json({
      attempt: {
        id: row.id,
        student_name: row.student_name,
        status: row.status,
        started_at: row.started_at,
        submitted_at: row.submitted_at,
      },
      result: row.status === "submitted" ? scoreAttempt(items) : null,
      responses: items.map((x) => ({
        position: x.position,
        question_code: x.question_code,
        selected_option: x.selected_option,
        correct_option:
          row.status === "submitted" ? x.correct_option : undefined,
        module_code: x.primary_module_code,
      })),
    });
  }),
);
app.delete(
  "/api/admin/attempts/:id",
  admin,
  asyncRoute(async (req, res) => {
    const result = await query(
      "DELETE FROM attempts WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!result.rows.length) return fail(res, 404, "Attempt not found.");
    res.json({ deleted: true });
  }),
);
app.get(
  "/api/admin/analytics",
  admin,
  asyncRoute(async (req, res) => {
    const attempts = (
      await query(`SELECT id,score FROM attempts WHERE status='submitted'`)
    ).rows;
    const totals = MODULES.map((m) => ({ ...m, correct: 0, total: 0 }));
    for (const a of attempts)
      for (const m of scoreAttempt(await attemptRows(query, a.id)).modules) {
        const target = totals.find((x) => x.code === m.code);
        target.correct += m.correct;
        target.total += m.total;
      }
    const modules = totals.map((m) => ({
      ...m,
      accuracy: m.total ? (m.correct / m.total) * 100 : 0,
    }));
    res.json({
      attempts_count: attempts.length,
      average_score: attempts.length
        ? attempts.reduce((n, a) => n + a.score, 0) / attempts.length
        : 0,
      modules,
      weakest_class_module: attempts.length
        ? [...modules].sort(
            (a, b) =>
              a.accuracy - b.accuracy || a.display_order - b.display_order,
          )[0].name
        : null,
    });
  }),
);
app.use((error, req, res, next) => {
  console.error(error);
  fail(res, 500, "Server error.");
});
export async function prepare() {
  await seedBase();
  if (process.env.SKIP_QUESTION_BANK_SEED !== "1") await seedQuestionBank();
}
