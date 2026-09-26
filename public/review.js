import { $, escapeHtml, attemptApi, message } from "./common.js";
const id = new URLSearchParams(location.search).get("id");
$("#back").href = `/result.html?id=${encodeURIComponent(id)}`;
try {
  const r = await attemptApi(id, "/review");
  $("#name").textContent = `${r.student_name} · Active & Passive Voice`;
  $("#review").innerHTML = r.questions
    .map(
      (q) =>
        `<article class="card review-item" id="${escapeHtml(q.module_code)}"><div class="question-meta"><span>QUESTION ${q.position} · ${escapeHtml(q.question_code)}</span><span class="badge ${q.is_correct ? "Strong" : q.selected_option ? "Weak" : "Needs-Review"}">${q.is_correct ? "Correct" : q.selected_option ? "Incorrect" : "Unattempted"}</span></div><h3>${escapeHtml(q.prompt)}</h3><div class="review-options">${Object.entries(
          q.options,
        )
          .map(
            ([key, value]) =>
              `<div class="review-option ${key === q.correct_option ? "correct" : key === q.selected_option ? "wrong" : ""}"><b>${key}.</b> ${escapeHtml(value)} ${key === q.correct_option ? " ✓ Correct answer" : key === q.selected_option ? " · Your answer" : ""}</div>`,
          )
          .join(
            "",
          )}</div><p><b>Your answer:</b> ${q.selected_option || "Unattempted"} &nbsp; <b>Correct answer:</b> ${q.correct_option}</p><p class="muted">${escapeHtml(q.explanation)}</p><div class="review-meta">${escapeHtml(q.module_name)} · ${escapeHtml(q.sub_module.replaceAll("_", " "))} · Rule: ${escapeHtml(q.rule_summary)}<br>${escapeHtml(q.exam_name)} ${escapeHtml(q.exam_year)}${q.exam_date ? " | " + escapeHtml(q.exam_date) : ""}${q.shift ? " | " + escapeHtml(q.shift) : ""} · <a href="${escapeHtml(q.source_url)}" target="_blank" rel="noopener noreferrer">Source ↗</a></div></article>`,
    )
    .join("");
  if (location.hash) $(location.hash)?.scrollIntoView();
} catch (error) {
  $("#review").innerHTML = message(error.message, "error");
}
