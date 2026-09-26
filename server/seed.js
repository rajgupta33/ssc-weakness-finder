import { initDb, query } from "./db.js";
import { MODULES, DIAGNOSTIC } from "./config.js";

export async function seedBase() {
  await initDb();
  await query(
    `INSERT INTO diagnostics(id,title,subject,chapter,question_count,is_active) VALUES($1,$2,$3,$4,$5,TRUE) ON CONFLICT(id) DO NOTHING`,
    [
      DIAGNOSTIC.id,
      DIAGNOSTIC.title,
      DIAGNOSTIC.subject,
      DIAGNOSTIC.chapter,
      DIAGNOSTIC.question_count,
    ],
  );
  for (const m of MODULES)
    await query(
      `INSERT INTO modules(code,diagnostic_id,name,revision_text,display_order,expected_count) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code) DO NOTHING`,
      [
        m.code,
        DIAGNOSTIC.id,
        m.name,
        m.revision_text,
        m.display_order,
        m.count,
      ],
    );
}
