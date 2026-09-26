export const $ = (s, root = document) => root.querySelector(s);
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const pct = (n) => `${Math.round(Number(n) || 0)}%`;
export const tokenFor = (id) =>
  sessionStorage.getItem(`attempt:${id}`) ||
  localStorage.getItem(`attempt:${id}`) ||
  "";
export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const response = await fetch(path, { ...options, headers });
  let body;
  try {
    body = await response.json();
  } catch {
    body = { error: "Unexpected server response." };
  }
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
export const attemptApi = (id, path, options = {}) =>
  api(`/api/attempts/${encodeURIComponent(id)}${path}`, {
    ...options,
    headers: { "x-attempt-token": tokenFor(id), ...options.headers },
  });
export function message(text, type = "notice") {
  return `<div class="notice ${type}">${escapeHtml(text)}</div>`;
}
