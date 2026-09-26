import { describe, it, expect, beforeAll } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { MODULES } from "../server/config.js";

let app, query;
beforeAll(async () => {
  process.env.DATABASE_URL = "";
  process.env.SKIP_QUESTION_BANK_SEED = "1";
  process.env.ADMIN_PASSWORD = "test-admin-password";
  process.env.SESSION_SECRET = "test-admin-session-secret";
  process.env.PGLITE_DATA_DIR = await mkdtemp(join(tmpdir(), "ssc-test-"));
  ({ app } = await import("../server/app.js"));
  ({ query } = await import("../server/db.js"));
  const { prepare } = await import("../server/app.js");
  await prepare();
  let position = 0;
  for (const m of MODULES)
    for (let n = 0; n < m.count; n++) {
      const id = `fixture-${++position}`;
      await query(
        `INSERT INTO questions(id,question_code,subject,chapter_slug,primary_module_code,sub_module,difficulty,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,rule_summary,exam_name,exam_year,source_type,source_url,verification_status,verified_by,verified_at,is_live,display_order) VALUES($1,$2,'English','active-passive-voice',$3,'fixture','medium','Synthetic test fixture','A','B','C','D','A','Synthetic explanation','Synthetic rule','Synthetic exam',2025,'archive','https://example.com','verified','Test fixture','2026-01-01',TRUE,$4)`,
        [id, id, m.code, position],
      );
      await query(
        `INSERT INTO diagnostic_questions(diagnostic_id,question_id,display_order) VALUES('active-passive-voice-20',$1,$2)`,
        [id, position],
      );
    }
});
describe("attempt API", () => {
  it("requires ownership and withholds review and results until submission", async () => {
    const { body } = await request(app)
      .post("/api/attempts")
      .send({ student_name: "Privacy Student" })
      .expect(201);
    await request(app).get(`/api/attempts/${body.attempt_id}`).expect(404);
    for (const endpoint of ["result", "review"])
      await request(app)
        .get(`/api/attempts/${body.attempt_id}/${endpoint}`)
        .set("x-attempt-token", body.access_token)
        .expect(409);
    await request(app).get("/api/admin/attempts").expect(401);
    await request(app)
      .post("/api/admin/login")
      .send({ password: "字".repeat(19) })
      .expect(401);
  });
  it("hides answers, locks responses, and makes repeated submission idempotent", async () => {
    const start = await request(app)
      .post("/api/attempts")
      .send({ student_name: "Test Student" })
      .expect(201);
    const { attempt_id, access_token, questions } = start.body;
    expect(questions).toHaveLength(20);
    expect(JSON.stringify(questions)).not.toContain("correct_option");
    expect(JSON.stringify(questions)).not.toContain("explanation");
    await request(app)
      .put(`/api/attempts/${attempt_id}/responses`)
      .set("x-attempt-token", access_token)
      .send({
        question_id: questions[0].id,
        selected_option: "A",
        marked_for_review: false,
        visited: true,
      })
      .expect(200);
    const submit = () =>
      request(app)
        .post(`/api/attempts/${attempt_id}/submit`)
        .set("x-attempt-token", access_token)
        .send({ score: 20 });
    await submit().expect(200);
    await submit().expect(200);
    await request(app)
      .put(`/api/attempts/${attempt_id}/responses`)
      .set("x-attempt-token", access_token)
      .send({
        question_id: questions[0].id,
        selected_option: "B",
        marked_for_review: false,
        visited: true,
      })
      .expect(409);
    const result = await request(app)
      .get(`/api/attempts/${attempt_id}/result`)
      .set("x-attempt-token", access_token)
      .expect(200);
    expect(result.body.score).toBe(1);
    expect(result.body.unattempted).toBe(19);
  });
  it("keeps snapshots independent from later question bank edits", async () => {
    const { body } = await request(app)
      .post("/api/attempts")
      .send({ student_name: "Snapshot Student" })
      .expect(201);
    const base = `/api/attempts/${body.attempt_id}`;
    await query(
      "UPDATE questions SET correct_option='B',prompt='Edited master' WHERE id='fixture-1'",
    );
    await request(app)
      .put(base + "/responses")
      .set("x-attempt-token", body.access_token)
      .send({
        question_id: "fixture-1",
        selected_option: "A",
        marked_for_review: false,
        visited: true,
      })
      .expect(200);
    await request(app)
      .post(base + "/submit")
      .set("x-attempt-token", body.access_token)
      .expect(200);
    const review = await request(app)
      .get(base + "/review")
      .set("x-attempt-token", body.access_token)
      .expect(200);
    expect(review.body.questions[0]).toMatchObject({
      correct_option: "A",
      prompt: "Synthetic test fixture",
      is_correct: true,
    });
    await query(
      "UPDATE questions SET correct_option='A',prompt='Synthetic test fixture' WHERE id='fixture-1'",
    );
  });
  it("serializes simultaneous saves and submissions and freezes the result", async () => {
    const { body } = await request(app)
      .post("/api/attempts")
      .send({ student_name: "Concurrent Student" })
      .expect(201);
    const base = `/api/attempts/${body.attempt_id}`,
      token = body.access_token;
    const [save, first, second] = await Promise.all([
      request(app)
        .put(base + "/responses")
        .set("x-attempt-token", token)
        .send({
          question_id: "fixture-1",
          selected_option: "A",
          marked_for_review: false,
          visited: true,
        }),
      request(app)
        .post(base + "/submit")
        .set("x-attempt-token", token),
      request(app)
        .post(base + "/submit")
        .set("x-attempt-token", token),
    ]);
    expect([200, 409]).toContain(save.status);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const result = await request(app)
      .get(base + "/result")
      .set("x-attempt-token", token)
      .expect(200);
    const stored = (
      await query("SELECT score FROM attempts WHERE id=$1", [body.attempt_id])
    ).rows[0];
    expect(result.body.score).toBe(stored.score);
    expect(result.body.score).toBe(save.status === 200 ? 1 : 0);
  });
  it("blocks a diagnostic when one assigned question is not live", async () => {
    await query("UPDATE questions SET is_live=FALSE WHERE id='fixture-1'");
    await request(app)
      .post("/api/attempts")
      .send({ student_name: "Blocked Student" })
      .expect(503);
    await query("UPDATE questions SET is_live=TRUE WHERE id='fixture-1'");
  });
});
