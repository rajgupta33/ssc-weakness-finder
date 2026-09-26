import { MODULES } from "./config.js";

export function safeQuestion(q) {
  return {
    id: q.id,
    question_code: q.question_code,
    prompt: q.prompt,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    exam_name: q.exam_name,
    exam_year: q.exam_year,
    exam_date: q.exam_date,
    shift: q.shift,
    position: q.position,
  };
}
export function readiness(rows) {
  const errors = [];
  if (rows.length !== 20)
    errors.push(`Expected 20 form questions; found ${rows.length}.`);
  const counts = new Map(MODULES.map((m) => [m.code, 0]));
  const positions = new Set();
  for (const q of rows) {
    counts.set(
      q.primary_module_code,
      (counts.get(q.primary_module_code) || 0) + 1,
    );
    positions.add(q.position);
    if (
      q.verification_status !== "verified" ||
      !q.is_live ||
      !q.verified_by ||
      !q.verified_at ||
      !q.source_url ||
      !q.explanation ||
      !q.rule_summary ||
      !["A", "B", "C", "D"].includes(q.correct_option)
    )
      errors.push(`${q.question_code}: not publishable`);
  }
  for (const m of MODULES)
    if (counts.get(m.code) !== m.count)
      errors.push(
        `${m.code}: expected ${m.count}, found ${counts.get(m.code)}`,
      );
  if (positions.size !== 20 || [...positions].some((n) => n < 1 || n > 20))
    errors.push("Display positions must be 1 through 20.");
  return { ready: errors.length === 0, errors };
}
export function scoreAttempt(items) {
  const scored = items.map((item) => {
    const selected = item.selected_option || null;
    const correct = selected === item.correct_option;
    return {
      ...item,
      selected_option: selected,
      is_correct: correct,
      points: correct ? 1 : 0,
    };
  });
  const correct = scored.filter((x) => x.is_correct).length;
  const incorrect = scored.filter(
    (x) => x.selected_option && !x.is_correct,
  ).length;
  const unattempted = scored.length - correct - incorrect;
  const modules = MODULES.map((m) => {
    const own = scored.filter((x) => x.primary_module_code === m.code);
    const mc = own.filter((x) => x.is_correct).length;
    const mw = own.filter((x) => x.selected_option && !x.is_correct).length;
    const mu = own.length - mc - mw;
    const accuracy = own.length ? (mc / own.length) * 100 : 0;
    const status =
      accuracy >= 80 ? "Strong" : accuracy >= 50 ? "Needs Review" : "Weak";
    const mistakes = own.filter((x) => x.selected_option && !x.is_correct);
    const patterns = Object.values(
      mistakes.reduce((groups, x) => {
        const key = x.sub_module;
        (groups[key] ??= {
          sub_module: key,
          count: 0,
          rule_summary: x.rule_summary,
          questions: [],
        }).questions.push(x.position);
        groups[key].count++;
        return groups;
      }, {}),
    );
    return {
      ...m,
      total: own.length,
      correct: mc,
      wrong: mw,
      unattempted: mu,
      accuracy,
      status,
      patterns,
      detail: mu === own.length ? "Not demonstrated / unanswered" : null,
    };
  });
  const weakAreas = modules
    .filter((x) => x.status !== "Strong")
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy ||
        b.wrong - a.wrong ||
        b.unattempted - a.unattempted ||
        a.display_order - b.display_order,
    )
    .slice(0, 3);
  return {
    score: correct,
    max_score: scored.length,
    correct,
    incorrect,
    unattempted,
    accuracy: correct + incorrect ? (correct / (correct + incorrect)) * 100 : 0,
    modules,
    weakAreas,
    scored,
  };
}
