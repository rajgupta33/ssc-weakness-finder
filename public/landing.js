import { $, api, message } from "./common.js";
const status = $("#status"),
  button = $("#start-btn");
try {
  const data = await api("/api/diagnostic");
  button.disabled = !data.ready;
  if (!data.ready) {
    button.disabled = true;
    status.innerHTML = message(data.setup_message);
  }
} catch (error) {
  button.disabled = true;
  status.innerHTML = message(error.message, "error");
}
$("#start-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.innerHTML = "";
  try {
    const data = await api("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ student_name: $("#student-name").value }),
    });
    sessionStorage.setItem(`attempt:${data.attempt_id}`, data.access_token);
    localStorage.setItem(`attempt:${data.attempt_id}`, data.access_token);
    location.href = `/test.html?id=${encodeURIComponent(data.attempt_id)}`;
  } catch (error) {
    status.innerHTML = message(error.message, "error");
    button.disabled = false;
  }
});
