import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { seedBase } from "./seed.js";
import { transaction } from "./db.js";
import { MODULES } from "./config.js";

export function validateImport(items) {
  if (!Array.isArray(items))
    throw new Error("Import file must contain a JSON array.");
  const codes = new Set(),
    positions = new Set();
  for (const [index, q] of items.entries()) {
    const label = `Item ${index + 1}`;
    if (!q || typeof q !== "object")
      throw new Error(`${label}: expected a question object`);
    for (const key of [
      "question_code",
      "subject",
      "chapter_slug",
      "primary_module_code",
      "sub_module",
      "difficulty",
      "prompt",
      "correct_option",
      "explanation",
      "rule_summary",
      "exam_name",
      "exam_year",
      "source_type",
      "source_url",
      "verification_status",
      "display_order",
    ])
      if (q[key] === undefined || q[key] === null || q[key] === "")
        throw new Error(`${label}: missing ${key}`);
    if (codes.has(q.question_code))
      throw new Error(`${label}: duplicate question_code`);
    codes.add(q.question_code);
    if (!MODULES.some((m) => m.code === q.primary_module_code))
      throw new Error(`${label}: unknown module`);
    if (!["A", "B", "C", "D"].includes(q.correct_option))
      throw new Error(`${label}: invalid correct_option`);
    if (!["easy", "medium", "hard"].includes(q.difficulty))
      throw new Error(`${label}: invalid difficulty`);
    if (!["unverified", "checked", "verified"].includes(q.verification_status))
      throw new Error(`${label}: invalid verification_status`);
    if (!q.options || ["A", "B", "C", "D"].some((k) => !q.options[k]?.trim()))
      throw new Error(`${label}: exactly four nonempty options required`);
    if (Object.keys(q.options).sort().join("") !== "ABCD")
      throw new Error(`${label}: only options A, B, C, D are permitted`);
    if (typeof q.is_live !== "boolean")
      throw new Error(`${label}: is_live must be a boolean`);
    if (
      !Number.isInteger(q.display_order) ||
      q.display_order < 1 ||
      q.display_order > 20
    )
      throw new Error(
        `${label}: display_order must be an integer from 1 to 20`,
      );
    if (
      !Number.isInteger(q.exam_year) ||
      q.exam_year < 1900 ||
      q.exam_year > new Date().getFullYear()
    )
      throw new Error(`${label}: invalid exam_year`);
    if (
      !["ssc_official", "secondary_database", "archive"].includes(q.source_type)
    )
      throw new Error(`${label}: invalid source_type`);
    if (
      q.verification_status === "verified" &&
      Number.isNaN(Date.parse(q.verified_at))
    )
      throw new Error(`${label}: invalid verified_at`);
    if (
      q.is_live &&
      (q.verification_status !== "verified" || !q.verified_by || !q.verified_at)
    )
      throw new Error(
        `${label}: live questions require teacher/editor verification`,
      );
    if (
      q.verification_status === "verified" &&
      (!q.verified_by || !q.verified_at)
    )
      throw new Error(`${label}: verified_by and verified_at required`);
    if (q.is_live && positions.has(q.display_order))
      throw new Error(`${label}: duplicate live display_order`);
    if (q.is_live) positions.add(q.display_order);
    try {
      if (!["https:", "http:"].includes(new URL(q.source_url).protocol))
        throw new Error();
    } catch {
      throw new Error(`${label}: invalid source_url`);
    }
  }
  return items;
}

export async function importQuestions(items, { onlyIfEmpty = false } = {}) {
  validateImport(items);
  await seedBase();
  await transaction(async (run) => {
    // Also used by automatic seeding: lock the diagnostic across cold starts.
    await run("SELECT id FROM diagnostics WHERE id=$1 FOR UPDATE", [
      "active-passive-voice-20",
    ]);
    if (
      onlyIfEmpty &&
      (await run("SELECT id FROM questions LIMIT 1")).rows.length
    )
      return;
    for (const q of items) {
      const id = q.id || randomUUID();
      await run(
        `INSERT INTO questions(id,question_code,subject,chapter_slug,primary_module_code,sub_module,difficulty,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,rule_summary,exam_name,paper_stage,exam_year,exam_date,shift,source_type,source_url,source_note,verification_status,verified_by,verified_at,is_live,display_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          id,
          q.question_code,
          q.subject,
          q.chapter_slug,
          q.primary_module_code,
          q.sub_module,
          q.difficulty,
          q.prompt,
          q.options.A,
          q.options.B,
          q.options.C,
          q.options.D,
          q.correct_option,
          q.explanation,
          q.rule_summary,
          q.exam_name,
          q.paper_stage || null,
          q.exam_year,
          q.exam_date || null,
          q.shift || null,
          q.source_type,
          q.source_url,
          q.source_note || null,
          q.verification_status,
          q.verified_by || null,
          q.verified_at || null,
          Boolean(q.is_live),
          q.display_order,
        ],
      );
      if (q.is_live)
        await run(
          `INSERT INTO diagnostic_questions(diagnostic_id,question_id,display_order) VALUES($1,$2,$3)`,
          ["active-passive-voice-20", id, q.display_order],
        );
    }
  });
  return items.length;
}
if (process.argv[1]?.endsWith("import.js")) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run import -- path/to/questions.json");
    process.exit(1);
  }
  try {
    console.log(
      `Imported ${await importQuestions(JSON.parse(await readFile(path, "utf8")))} questions.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
