import { writeFile } from "node:fs/promises";
import { QUESTIONS } from "../data/active-passive.js";
await writeFile(
  "data/questions.json",
  JSON.stringify(QUESTIONS, null, 2) + "\n",
);
const intro =
  "# Review the 20-question SSC bank\n\nStatus: approved for live use by repository owner rajgupta33 in Codex on 26 September 2026. Keys below are transcribed from linked secondary records. Official final-key certification has not been obtained.\n\n";
const sections = QUESTIONS.map(
  (q) =>
    `## ${q.question_code} — ${q.primary_module_code}\n\n${q.prompt}\n\n${Object.entries(
      q.options,
    )
      .map(([letter, text]) => `- **${letter}.** ${text}`)
      .join(
        "\n",
      )}\n\n**Published answer: ${q.correct_option}.** ${q.explanation}\n\n${q.exam_name} ${q.exam_year} · ${q.exam_date}${q.shift ? " · " + q.shift : ""}\n\n[Inspect source record](${q.source_url})\n`,
);
await writeFile("data/QUESTION_BANK_REVIEW.md", intro + sections.join("\n"));
console.log("Exported JSON and teacher review document.");
