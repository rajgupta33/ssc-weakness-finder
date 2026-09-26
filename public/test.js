import { $, escapeHtml, attemptApi, message } from "./common.js";
const id = new URLSearchParams(location.search).get("id");
let data,
  current = 0,
  saving = Promise.resolve();
const pending = new Map();
const alert = $("#alert");
const mobile = window.matchMedia("(max-width:850px)");
$("#palette-drawer").open = !mobile.matches;
function counts() {
  const r = data.responses;
  return {
    answered: r.filter((x) => x.selected_option).length,
    unanswered: r.filter((x) => !x.selected_option).length,
    marked: r.filter((x) => x.marked_for_review).length,
  };
}
function render() {
  const q = data.questions[current],
    r = data.responses[current],
    c = counts();
  $("#student-label").textContent =
    `${data.student_name} · Question ${current + 1} of ${data.questions.length}`;
  $("#progress-label").textContent =
    `Answered ${c.answered} of ${data.questions.length}`;
  $("#progress-bar").style.width =
    `${(c.answered / data.questions.length) * 100}%`;
  $("#question").innerHTML =
    `<div class="question-meta"><span>QUESTION ${current + 1} OF ${data.questions.length}</span><span>${escapeHtml(q.exam_name)} ${escapeHtml(q.exam_year)}</span></div><h2 class="question-text">${escapeHtml(q.prompt)}</h2><div>${Object.entries(
      q.options,
    )
      .map(
        ([key, value]) =>
          `<button class="option ${r.selected_option === key ? "selected" : ""}" data-answer="${key}"><span class="letter">${key}</span><span>${escapeHtml(value)}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="actions"><button class="btn ghost" id="previous" ${current === 0 ? "disabled" : ""}>← Previous</button><button class="btn ghost" id="clear">Clear</button><button class="btn secondary" id="mark">${r.marked_for_review ? "Unmark review" : "Mark for review"}</button><span class="spacer"></span><button class="btn" id="next">${current === data.questions.length - 1 ? "Save" : "Save & Next →"}</button></div>`;
  $("#palette").innerHTML = data.responses
    .map(
      (x, i) =>
        `<button data-index="${i}" class="${x.selected_option ? "answered" : x.visited ? "visited" : ""} ${x.marked_for_review ? "marked" : ""} ${i === current ? "active" : ""}" aria-label="Question ${i + 1}">${i + 1}</button>`,
    )
    .join("");
  $$("[data-answer]").forEach(
    (el) =>
      (el.onclick = () => {
        r.selected_option = el.dataset.answer;
        save();
        render();
      }),
  );
  $("#previous").onclick = () => navigate(current - 1);
  $("#next").onclick = () =>
    navigate(Math.min(current + 1, data.questions.length - 1));
  $("#clear").onclick = () => {
    r.selected_option = null;
    save();
    render();
  };
  $("#mark").onclick = () => {
    r.marked_for_review = !r.marked_for_review;
    save();
    render();
  };
  $$("[data-index]", "#palette").forEach(
    (el) =>
      (el.onclick = () => {
        navigate(Number(el.dataset.index));
        if (mobile.matches) {
          $("#palette-drawer").open = false;
          $("#question").scrollIntoView({ block: "start" });
        }
      }),
  );
}
const $$ = (s, root = document) => [
  ...(typeof root === "string" ? $(root) : root).querySelectorAll(s),
];
function save() {
  const q = data.questions[current],
    r = data.responses[current];
  const payload = {
    question_id: q.id,
    selected_option: r.selected_option,
    marked_for_review: r.marked_for_review,
    visited: true,
  };
  pending.set(q.id, payload);
  saving = saving
    .catch(() => {})
    .then(async () => {
      try {
        await attemptApi(id, "/responses", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (pending.get(q.id) === payload) pending.delete(q.id);
        if (!pending.size) alert.innerHTML = "";
      } catch {
        showSaveError();
      }
    });
}
function showSaveError() {
  alert.innerHTML = `${message("Save failed. Your selection is kept here; retry before submitting.", "error")}<button class="btn secondary" id="retry-save">Retry save</button>`;
  $("#retry-save").onclick = retryPending;
}
async function retryPending() {
  await saving;
  for (const [questionId, payload] of pending) {
    try {
      await attemptApi(id, "/responses", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (pending.get(questionId) === payload) pending.delete(questionId);
    } catch {
      showSaveError();
      return;
    }
  }
  if (!pending.size) alert.innerHTML = "";
}
function navigate(index) {
  current = index;
  data.responses[current].visited = true;
  save();
  render();
}
function confirmSubmit() {
  const c = counts();
  $("#modal-root").innerHTML =
    `<div class="overlay"><div class="card modal"><h2>Submit your test?</h2><p class="muted">After submission, answers cannot be changed.</p><div class="stats-line"><span>Answered: <b>${c.answered}</b></span><span>Unanswered: <b>${c.unanswered}</b></span><span>Marked for review: <b>${c.marked}</b></span></div><div class="actions"><button class="btn ghost" id="go-back">Go Back</button><button class="btn" id="confirm-submit">Submit Test</button></div></div></div>`;
  $("#go-back").onclick = () => ($("#modal-root").innerHTML = "");
  $("#confirm-submit").onclick = async () => {
    const b = $("#confirm-submit");
    b.disabled = true;
    await retryPending();
    if (pending.size) {
      showSaveError();
      $("#modal-root").innerHTML = "";
      return;
    }
    try {
      const result = await attemptApi(id, "/submit", { method: "POST" });
      location.href = result.result_url;
    } catch (error) {
      alert.innerHTML = message(error.message, "error");
      $("#modal-root").innerHTML = "";
    }
  };
}
$("#submit-top").onclick = confirmSubmit;
try {
  if (!id) throw new Error("Missing attempt ID.");
  data = await attemptApi(id, "");
  if (data.status === "submitted") location.href = data.result_url;
  else {
    data.responses = data.questions.map((q) =>
      data.responses.find((r) => r.question_id === q.id),
    );
    render();
    navigate(0);
    $("#submit-top").disabled = false;
  }
} catch (error) {
  $("#question").innerHTML = message(error.message, "error");
  $("#submit-top").disabled = true;
}
