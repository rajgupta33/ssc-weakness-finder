# SSC Weakness Finder

A 20-question SSC English Active & Passive Voice diagnostic. Students enter a name, answer the fixed form, then receive a score, eight module results, revision priorities and answer review. The teacher workspace shows question sources, attempts and class aggregates.

## Run locally

Requires Node.js 22.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:3000. The approved 20-question bank is seeded automatically on an empty database. The teacher page is at `/admin.html`; use `ADMIN_PASSWORD` from the generated `.env`. Existing `.env` files are preserved. Local PostgreSQL-compatible PGlite data lives in `.data/db` and is excluded from Git.

## Question provenance

The repository owner approved this reviewed set for live use on 26 September 2026. Every question includes its SSC exam, cycle year, sitting date, shift when available, published answer key, source URL and approval metadata. Verification is based on secondary exam records, not a claim of official final-key certification. See [the audit](data/SOURCE_AUDIT.md) and [the full review document](data/QUESTION_BANK_REVIEW.md).

The bank has exactly AP01 3, AP02 3, AP03 3, AP04 2, AP05 2, AP06 3, AP07 2 and AP08 2 questions. Source wording and option order are preserved. Scoring reads the stored key and does not use AI.

For new questions, prepare a UTF-8 JSON array using [data/questions.json](data/questions.json) as the data contract. Do not import this shipped bank again into an already seeded database; duplicate codes are rejected. For a custom bank, set `SKIP_QUESTION_BANK_SEED=1` on a fresh database before importing:

```sh
npm run import -- path/to/questions.json
```

Unverified or checked candidates must have `is_live: false`. After reviewing the source and key, the teacher can approve the complete bank in **Questions → Verify & Publish 20 Questions**. Invalid records and incomplete forms are rejected. Existing student attempts retain immutable question snapshots when the bank changes.

## Deploy to Vercel

1. Import `rajgupta33/ssc-weakness-finder` in Vercel. Use the **Express** framework preset, Node.js 22, and the repository root. No frontend build command is needed.
2. Connect a PostgreSQL database, such as Neon through the Vercel Marketplace. Set `DATABASE_URL` to its pooled PostgreSQL connection URL. Local PGlite storage is deliberately disabled on Vercel.
3. Set long random `ADMIN_PASSWORD` and `SESSION_SECRET` environment variables in Vercel. Keep them server-only. Do not use `NEXT_PUBLIC_` or expose them in client files.
4. Deploy. The first API request initializes the schema and seeds the approved bank. The root `app.js` is the Vercel entry point; `server/index.js` serves local development.
5. Open the deployment and confirm `/api/diagnostic` returns `ready: true`. Complete a student attempt and inspect it in the teacher workspace.

[Vercel Express documentation](https://vercel.com/docs/frameworks/backend/express) · [PostgreSQL integrations](https://vercel.com/docs/postgres)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Hosted PostgreSQL URL; required on Vercel |
| `ADMIN_PASSWORD` | Teacher sign-in password |
| `SESSION_SECRET` | Signs teacher session cookies |
| `PORT` | Local port, default 3000 |
| `PGLITE_DATA_DIR` | Optional local database directory |
| `SKIP_QUESTION_BANK_SEED` | Set to `1` only when supplying a custom bank |

## Verification

```sh
npx playwright install chromium
npm run check
```

Vitest checks scoring, ties, privacy of pre-submit payloads and submission locking. Playwright checks the complete student and teacher flow on desktop and mobile, including refresh and network failure recovery. Browser tests use a separate temporary database and never modify local student data. GitHub Actions runs the suite on pushes and pull requests.

## Privacy and security

Only the student name and test performance are collected. Each attempt has a random private token stored in the student's browser. Submitted responses are locked and final submission is idempotent. Answer changes and submission acquire the same database lock to keep results consistent. Keys and explanations are returned only after submission. Admin access uses an HTTP-only signed cookie. Teacher routes are protected, and creation/login endpoints have per-instance limits; use Vercel Firewall rules for deployment-wide abuse protection. The teacher can permanently delete an attempt from its detail screen.

No credentials, database files or real student attempts belong in Git. The fixed question bank and its answers are public repository content; the in-app pre-submit API still withholds the answers. This is a revision diagnostic, not a proctored high-stakes exam.
