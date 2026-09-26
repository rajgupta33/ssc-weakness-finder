import { describe, it, expect } from "vitest";
import { QUESTIONS } from "../data/active-passive.js";
import { validateImport } from "../server/import.js";
import { readiness } from "../server/logic.js";

describe("approved source bank", () => {
  it("has 20 distinct questions satisfying the fixed publication blueprint", () => {
    expect(validateImport(QUESTIONS)).toHaveLength(20);
    expect(new Set(QUESTIONS.map((q) => q.source_url)).size).toBe(20);
    expect(
      readiness(QUESTIONS.map((q) => ({ ...q, position: q.display_order }))),
    ).toEqual({ ready: true, errors: [] });
  });
  it("requires real booleans and verification metadata on import", () => {
    expect(() =>
      validateImport([{ ...QUESTIONS[0], is_live: "false" }]),
    ).toThrow("boolean");
    expect(() =>
      validateImport([{ ...QUESTIONS[0], verification_status: "checked" }]),
    ).toThrow("verification");
    expect(() =>
      validateImport([{ ...QUESTIONS[0], verified_at: "not a date" }]),
    ).toThrow("verified_at");
  });
});
