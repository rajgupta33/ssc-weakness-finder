import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../../data/active-passive.js";

async function login(page) {
  await page.goto("/admin.html");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-browser-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Questions", exact: true }),
  ).toBeVisible();
}
async function start(page, name = "Browser Student") {
  await page.goto("/");
  await page.getByLabel("Student name").fill(name);
  await page.getByRole("button", { name: "Start Test" }).click();
  await expect(page).toHaveURL(/test.html\?id=/);
  await expect(page.locator(".option")).toHaveCount(4);
}
async function jump(page, index) {
  if (!(await page.locator("#palette-drawer").evaluate((el) => el.open)))
    await page.locator("#palette-drawer summary").click();
  await page.locator(`[data-index="${index}"]`).click();
}
test("teacher can inspect every source and approve the fixed form", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await expect(page.locator(".bank-question")).toHaveCount(20);
  await page.locator(".bank-question summary").first().click();
  await expect(
    page.getByRole("link", { name: "Open source record" }).first(),
  ).toBeVisible();
  if (await page.locator("#publish-form").count()) {
    await page
      .getByLabel("Teacher / editor name")
      .fill("Isolated browser test");
    await page.locator("#approve-bank").check();
    await page.getByRole("button", { name: "Verify & Publish" }).click();
  }
  await expect(page.getByText("20 verified questions are live.")).toBeVisible();
});
test("name entry, answer editing, refresh, submit, score and review work", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-test.png`,
    fullPage: true,
  });
  await page.locator('[data-answer="A"]').click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".option.selected")).toHaveCount(0);
  await page.locator('[data-answer="C"]').click();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await expect(page.locator('[data-index="0"]')).toHaveClass(/marked/);
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.locator("#student-label")).toContainText("Question 2");
  await page.reload();
  await expect(page.locator('[data-answer="C"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-index="0"]')).toHaveClass(/marked/);
  for (let i = 0; i < 20; i++) {
    await jump(page, i);
    await page
      .locator(`[data-answer="${QUESTIONS[i].correct_option}"]`)
      .click();
  }
  await expect(page.locator("#progress-label")).toHaveText("Answered 20 of 20");
  await page.getByRole("button", { name: "Final Submit" }).click();
  await expect(page.locator(".modal")).toContainText("Answered: 20");
  await page.getByRole("button", { name: "Submit Test", exact: true }).click();
  await expect(page).toHaveURL(/result.html/);
  await expect(page.locator(".score-big")).toContainText("20");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await expect(page.getByText("No major weak module detected")).toBeVisible();
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-result.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Review Answers" }).click();
  await expect(page.locator(".review-item")).toHaveCount(20);
  await expect(page.locator(".review-option.correct")).toHaveCount(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("unanswered submission gives zero and avoids unsupported diagnosis", async ({
  page,
}) => {
  await start(page, "Unanswered Student");
  await page.getByRole("button", { name: "Final Submit" }).click();
  await expect(page.locator(".modal")).toContainText("Unanswered: 20");
  await page.getByRole("button", { name: "Submit Test", exact: true }).click();
  await expect(page.locator(".score-big")).toHaveText("0 / 20");
  await expect(page.getByText("Not demonstrated / unanswered")).toHaveCount(3);
});
test("failed save is retained and retry restores the answer", async ({
  page,
}) => {
  await start(page, "Retry Student");
  let failing = true;
  await page.route("**/api/attempts/*/responses", (route) =>
    failing
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"Simulated outage"}',
        })
      : route.continue(),
  );
  await page.locator('[data-answer="C"]').click();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(page.locator('[data-answer="C"]')).toHaveClass(/selected/);
  failing = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.locator("#retry-save")).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-answer="C"]')).toHaveClass(/selected/);
});
test("teacher can inspect submitted attempts and class metrics", async ({
  page,
}) => {
  await login(page);
  await expect(page.getByText("Class module accuracy")).toBeVisible();
  await page.getByRole("button", { name: "Attempts", exact: true }).click();
  const row = page.locator("tr").filter({ hasText: "Browser Student" }).first();
  await row.getByRole("button", { name: "Open" }).click();
  await expect(
    page.getByRole("heading", { name: "Responses", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#tab-content")).toContainText("20/20");
});
