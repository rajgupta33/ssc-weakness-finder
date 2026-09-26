import { QUESTIONS } from "../data/active-passive.js";
import { query, transaction } from "./db.js";
import { importQuestions } from "./import.js";
import { readiness } from "./logic.js";
import { DIAGNOSTIC } from "./config.js";

export async function seedQuestionBank() {
  const existing = (await query("SELECT question_code FROM questions")).rows;
  // A different imported bank belongs to the teacher: never replace it automatically.
  if (existing.length) return;
  await importQuestions(QUESTIONS, { onlyIfEmpty: true });
}

export async function publishBank(reviewer) {
  return transaction(async (run) => {
    // Serialize publication with other editors.
    await run("SELECT id FROM diagnostics WHERE id=$1 FOR UPDATE", [
      DIAGNOSTIC.id,
    ]);
    const questions = (
      await run(
        "SELECT * FROM questions WHERE chapter_slug=$1 ORDER BY display_order",
        ["active-passive-voice"],
      )
    ).rows;
    const timestamp = new Date().toISOString();
    if (
      questions.some(
        (q) => !["checked", "verified"].includes(q.verification_status),
      )
    )
      throw new Error("Check all source records before publication.");
    const state = readiness(
      questions.map((q) => ({
        ...q,
        position: q.display_order,
        is_live: true,
        verification_status: "verified",
        verified_by: reviewer,
        verified_at: timestamp,
      })),
    );
    if (!state.ready) throw new Error(state.errors.join(" "));
    await run("DELETE FROM diagnostic_questions WHERE diagnostic_id=$1", [
      DIAGNOSTIC.id,
    ]);
    for (const q of questions) {
      await run(
        "UPDATE questions SET verification_status='verified',verified_by=$1,verified_at=$2,is_live=TRUE WHERE id=$3",
        [reviewer, timestamp, q.id],
      );
      await run(
        "INSERT INTO diagnostic_questions(diagnostic_id,question_id,display_order) VALUES($1,$2,$3)",
        [DIAGNOSTIC.id, q.id, q.display_order],
      );
    }
    return {
      published: true,
      count: questions.length,
      verified_by: reviewer,
      verified_at: timestamp,
    };
  });
}
