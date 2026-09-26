import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA_DIR = await mkdtemp(join(tmpdir(), "ssc-e2e-"));
process.env.ADMIN_PASSWORD = "isolated-browser-test-password";
process.env.SESSION_SECRET = "isolated-browser-test-secret-only";
process.env.NODE_ENV = "test";
process.env.SKIP_QUESTION_BANK_SEED = "1";
delete process.env.VERCEL;
const { app, prepare } = await import("../../server/app.js");
await prepare();
const { importQuestions } = await import("../../server/import.js");
const { QUESTIONS } = await import("../../data/active-passive.js");
await importQuestions(
  QUESTIONS.map((q) => ({
    ...q,
    verification_status: "checked",
    verified_by: null,
    verified_at: null,
    is_live: false,
  })),
);
app.listen(3101, "127.0.0.1");
