import { $, api, escapeHtml, pct, message } from "./common.js";
import { questionBank } from "./question-bank.js";
const root = $("#admin-root"),
  logout = $("#logout");
function login() {
  logout.classList.add("hidden");
  root.innerHTML = `<div class="card start-card" style="max-width:440px"><h2 class="card-heading">Teacher sign in</h2><p class="muted">Enter the admin password configured on the server.</p><form id="login-form"><label class="label" for="password">Password</label><input class="input" type="password" id="password" required><div id="login-error"></div><button class="btn wide" style="margin-top:20px">Sign in</button></form></div>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: $("#password").value }),
      });
      home();
    } catch (error) {
      $("#login-error").innerHTML = message(error.message, "error");
    }
  };
}
async function home() {
  logout.classList.remove("hidden");
  root.innerHTML = `<div class="admin-tabs"><button data-tab="overview" class="active">Overview</button><button data-tab="questions">Questions</button><button data-tab="attempts">Attempts</button></div><div id="tab-content"></div>`;
  root
    .querySelectorAll("[data-tab]")
    .forEach((b) => (b.onclick = () => select(b.dataset.tab)));
  select("overview");
}
async function select(tab) {
  root
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const target = $("#tab-content");
  target.innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (tab === "questions") {
      await questionBank(target);
      return;
    }
    if (tab === "overview") {
      const a = await api("/api/admin/analytics");
      target.innerHTML = `<div class="stat-grid"><div class="card stat"><strong>${a.attempts_count}</strong><span>Submitted attempts</span></div><div class="card stat"><strong>${a.average_score.toFixed(1)} / 20</strong><span>Average score</span></div><div class="card stat"><strong>${escapeHtml(a.weakest_class_module || "—")}</strong><span>Weakest class module</span></div></div><div class="card panel"><h2>Class module accuracy</h2><div class="table-wrap"><table><thead><tr><th>Module</th><th>Correct / Presented</th><th>Accuracy</th></tr></thead><tbody>${a.modules.map((m) => `<tr><td>${escapeHtml(m.name)}</td><td>${m.correct} / ${m.total}</td><td>${pct(m.accuracy)}</td></tr>`).join("")}</tbody></table></div></div>`;
    } else if (tab === "questions") {
      const a = await api("/api/admin/questions");
      target.innerHTML = `${a.readiness.ready ? message("Diagnostic ready: 20 verified live questions.", "success") : message(a.readiness.errors.join(" "))}<div class="card panel"><h2>Active question form</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Module</th><th>Source</th><th>Verification</th></tr></thead><tbody>${a.questions.map((q) => `<tr><td>${q.position}</td><td>${escapeHtml(q.question_code)}<br><small>${escapeHtml(q.prompt).slice(0, 100)}</small></td><td>${escapeHtml(q.module_code)}<br><small>${escapeHtml(q.sub_module)}</small></td><td><a href="${escapeHtml(q.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(q.exam_name)} ${escapeHtml(q.exam_year)}</a></td><td>${escapeHtml(q.verification_status)}<br><small>${escapeHtml(q.verified_by || "")}</small></td></tr>`).join("")}</tbody></table></div><p class="fine">Import verified questions with the documented JSON CLI. The test remains closed until exactly 20 eligible records match the module blueprint.</p></div>`;
    } else {
      const a = await api("/api/admin/attempts");
      target.innerHTML = `<div class="card panel"><h2>Recent attempts</h2><div class="table-wrap"><table><thead><tr><th>Student</th><th>Started</th><th>Status</th><th>Score</th><th>Weakest module</th><th></th></tr></thead><tbody>${a.attempts.map((x) => `<tr><td>${escapeHtml(x.student_name)}</td><td>${escapeHtml(new Date(x.started_at).toLocaleString())}</td><td>${escapeHtml(x.status)}</td><td>${x.score ?? "—"}</td><td>${escapeHtml(x.weakest_module || "—")}</td><td><button class="btn secondary" data-attempt="${escapeHtml(x.id)}">Open</button></td></tr>`).join("")}</tbody></table></div></div>`;
      target
        .querySelectorAll("[data-attempt]")
        .forEach((b) => (b.onclick = () => openAttempt(b.dataset.attempt)));
    }
  } catch (error) {
    target.innerHTML = message(error.message, "error");
  }
}
async function openAttempt(id) {
  const target = $("#tab-content");
  try {
    const a = await api(`/api/admin/attempts/${encodeURIComponent(id)}`);
    target.innerHTML = `<button class="btn ghost" id="back-attempts">← Attempts</button><div class="card panel" style="margin-top:16px"><h2>${escapeHtml(a.attempt.student_name)}</h2><p class="muted">${escapeHtml(a.attempt.status)} · ${escapeHtml(new Date(a.attempt.started_at).toLocaleString())}</p>${a.result ? `<p><b>Score:</b> ${a.result.score}/20 · <b>Accuracy:</b> ${pct(a.result.accuracy)}</p><div class="table-wrap"><table><thead><tr><th>Module</th><th>Correct / Total</th><th>Status</th></tr></thead><tbody>${a.result.modules.map((m) => `<tr><td>${escapeHtml(m.name)}</td><td>${m.correct}/${m.total}</td><td>${escapeHtml(m.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}<h2 style="margin-top:25px">Responses</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Module</th><th>Selected</th><th>Key</th></tr></thead><tbody>${a.responses.map((r) => `<tr><td>${r.position}</td><td>${escapeHtml(r.question_code)}</td><td>${escapeHtml(r.module_code)}</td><td>${escapeHtml(r.selected_option || "—")}</td><td>${escapeHtml(r.correct_option || "—")}</td></tr>`).join("")}</tbody></table></div><button class="btn danger" id="delete-attempt" style="margin-top:22px">Delete attempt</button></div>`;
    $("#back-attempts").onclick = () => select("attempts");
    $("#delete-attempt").onclick = async () => {
      if (!confirm("Permanently delete this attempt?")) return;
      await api(`/api/admin/attempts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      select("attempts");
    };
  } catch (error) {
    target.innerHTML = message(error.message, "error");
  }
}
logout.onclick = async () => {
  await api("/api/admin/logout", { method: "POST" });
  login();
};
try {
  (await api("/api/admin/me")).authenticated ? home() : login();
} catch {
  login();
}
