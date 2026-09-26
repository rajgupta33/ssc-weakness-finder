import { prepare } from "../server/app.js";
import { getDb } from "../server/db.js";
await prepare();
console.log(
  "Schema and approved question bank are ready. Existing bank records were preserved.",
);
const db = await getDb();
await (db.end ? db.end() : db.close());
