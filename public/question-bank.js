import { $, api, escapeHtml as esc, message } from "./common.js";

export async function questionBank(target) {
  const data = await api("/api/admin/questions");
  target.innerHTML = `${data.readiness.ready ? message("20 verified questions are live.", "success") : message("20 source-checked SSC records are ready for teacher review. Verify the answers and sources below, then publish the diagnostic.")}<div class="card panel"><h2>Question bank · ${data.questions.length} records</h2><p class="muted">Each key comes from the linked secondary record. No official final-key certification is implied.</p>${data.questions
    .map(
      (q) =>
        `<details class="bank-question"><summary><b>${esc(q.question_code)}</b> · ${esc(q.module_code)} · ${esc(q.exam_name)} ${q.exam_year} <span class="badge ${q.is_live ? "Strong" : "Needs-Review"}">${q.is_live ? "Verified / live" : esc(q.verification_status)}</span></summary><h3 style="white-space:pre-wrap">${esc(q.prompt)}</h3>${Object.entries(
          q.options,
        )
          .map(
            ([letter, text]) =>
              `<p class="review-option ${letter === q.correct_option ? "correct" : ""}"><b>${letter}.</b> ${esc(text)} ${letter === q.correct_option ? "✓ Source answer" : ""}</p>`,
          )
          .join(
            "",
          )}<p>${esc(q.explanation)}</p><p class="review-meta">${esc(q.sub_module)} · ${esc(q.exam_date || "")} · ${esc(q.shift || "Shift not specified")}<br><a href="${esc(q.source_url)}" target="_blank" rel="noopener noreferrer">Open source record ↗</a><br>${esc(q.source_note)}${q.verified_by ? `<br>Verified by ${esc(q.verified_by)} · ${esc(q.verified_at)}` : ""}</p></details>`,
    )
    .join(
      "",
    )}${!data.readiness.ready ? `<form id="publish-form" class="publish-form"><h3>Approve this 20-question diagnostic</h3><label class="label" for="reviewer">Teacher / editor name</label><input class="input" id="reviewer" required minlength="2" maxlength="60" placeholder="Your name"><label class="approval-check"><input type="checkbox" id="approve-bank" required> I have reviewed the question wording, answer keys and source records, and approve this set for students.</label><div id="publish-error"></div><button class="btn" type="submit">Verify & Publish 20 Questions</button></form>` : ""}</div>`;
  const form = $("#publish-form");
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await api("/api/admin/questions/publish", {
          method: "POST",
          body: JSON.stringify({
            reviewer: $("#reviewer").value,
            approved: $("#approve-bank").checked,
          }),
        });
        await questionBank(target);
      } catch (error) {
        $("#publish-error").innerHTML = message(error.message, "error");
        button.disabled = false;
      }
    };
}
