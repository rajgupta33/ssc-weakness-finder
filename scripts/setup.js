import { access, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  await access(".env");
  console.log(".env already exists; preserved existing settings.");
} catch {
  await writeFile(
    ".env",
    `PORT=3000\nADMIN_PASSWORD=${randomBytes(18).toString("base64url")}\nSESSION_SECRET=${randomBytes(32).toString("base64url")}\n`,
    { flag: "wx" },
  );
  console.log(
    "Created .env with random local admin credentials. Open .env to view your admin password.",
  );
}
