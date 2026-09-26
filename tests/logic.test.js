import { describe, it, expect } from "vitest";
import { MODULES } from "../server/config.js";
import { scoreAttempt, readiness, safeQuestion } from "../server/logic.js";

function items(answers = []) {
  let position = 0;
  return MODULES.flatMap((m) =>
    Array.from({ length: m.count }, () => ({
      id: `q${++position}`,
      question_code: `Q${position}`,
      position,
      primary_module_code: m.code,
      sub_module: "sample_rule",
      rule_summary: m.revision_text,
      correct_option: "A",
      selected_option: answers[position - 1] ?? null,
    })),
  );
}
describe("deterministic scoring", () => {
  it("scores 20/20 and classifies every module Strong", () => {
    const r = scoreAttempt(items(Array(20).fill("A")));
    expect(r.score).toBe(20);
    expect(r.accuracy).toBe(100);
    expect(r.modules.every((m) => m.status === "Strong")).toBe(true);
    expect(r.weakAreas).toEqual([]);
  });
  it("distinguishes wrong from unattempted and uses answered denominator", () => {
    const r = scoreAttempt(
      items([
        ...Array(10).fill("A"),
        ...Array(5).fill("B"),
        ...Array(5).fill(null),
      ]),
    );
    expect([r.score, r.correct, r.incorrect, r.unattempted]).toEqual([
      10, 10, 5, 5,
    ]);
    expect(r.accuracy).toBeCloseTo(66.6666667);
  });
  it("breaks equal accuracy ties by wrong then unattempted then display order", () => {
    const a = items(Array(20).fill("A"));
    a[0].selected_option = "B";
    a[1].selected_option = "B";
    a[3].selected_option = "B";
    a[4].selected_option = null;
    const r = scoreAttempt(a);
    expect(r.modules[0].accuracy).toBe(r.modules[1].accuracy);
    expect(r.weakAreas.map((x) => x.code).slice(0, 2)).toEqual([
      "AP01",
      "AP02",
    ]);
    const b = items(Array(20).fill("A"));
    b[1].selected_option = null;
    b[2].selected_option = null;
    b[4].selected_option = null;
    b[5].selected_option = null;
    const t = scoreAttempt(b);
    expect(t.weakAreas.map((x) => x.code).slice(0, 2)).toEqual([
      "AP01",
      "AP02",
    ]);
  });
  it("labels all-unanswered modules without claiming a mistake pattern", () => {
    const r = scoreAttempt(items());
    expect(r.score).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.modules[0].detail).toBe("Not demonstrated / unanswered");
    expect(r.modules[0].patterns).toEqual([]);
  });
});
describe("publication and payload", () => {
  it("does not send answer or explanation before submission", () => {
    const q = {
      ...items()[0],
      prompt: "Synthetic fixture",
      option_a: "one",
      option_b: "two",
      option_c: "three",
      option_d: "four",
      explanation: "secret",
      exam_name: "Synthetic",
      exam_year: 2024,
    };
    const safe = safeQuestion(q);
    expect(safe).not.toHaveProperty("correct_option");
    expect(safe).not.toHaveProperty("explanation");
  });
  it("rejects an unverified question in a complete form", () => {
    const rows = items().map((q) => ({
      ...q,
      verification_status: "verified",
      is_live: true,
      verified_by: "Fixture",
      verified_at: "2026-01-01",
      source_url: "https://example.com",
      explanation: "fixture",
    }));
    rows[0].verification_status = "checked";
    expect(readiness(rows).ready).toBe(false);
  });
});
