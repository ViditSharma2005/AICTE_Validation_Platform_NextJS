# AICTE Application Validation and Compliance Portal — Next.js

Extension of Approval (EoA) document validation for AICTE institutions:
checks at the upload gate, issuing-authority source comparison, editing
indicators and image-reuse detection, faculty ratio arithmetic over
verified teachers only, financial tests (Benford + three-way FDR
reconciliation), officer-requested room measurement, a cross-college
trust graph, and a hash-chained audit trail. Findings advise; a Senior
Officer records the only decision.

Design: GOV-3 royal-blue government portal (DBIM v3.0 / GIGW 3.0 pattern)
— utility bar with language/text-size/contrast controls, announcements
ticker, breadcrumbs, four-column footer, bilingual (English/Hindi) shell.

A floating **Portal Assistant** (bottom-right "Help" bubble) answers
navigation and how-to questions ("my document was returned — how do I fix
it?") from a built-in portal guide, with deep links into the app. It works
with zero configuration; Gemini or Grok can be switched on via env vars.

---

## Quick start (local)

Needs Node.js 18.17+ (Node 20 recommended).

```bash
npm install
npm run dev        # http://localhost:3000
```

Production mode:

```bash
npm run build
npm start          # http://localhost:3000
```

## Deploy on Vercel (one-time, ~3 minutes)

**Option A — GitHub (push-to-deploy afterwards)**

1. Push this folder to a GitHub repository (the folder must be the repo root).
2. In Vercel: **Add New → Project → Import** the repo. Framework preset
   auto-detects **Next.js**; leave build/output settings untouched.
3. (Recommended) add env var **AUTH_SECRET** = any long random string
   (Project → Settings → Environment Variables).
4. **Deploy**. Every later `git push` redeploys automatically. No sleeping
   instances, no 50-second cold wake.

**Option B — Vercel CLI from this folder**

```bash
npx vercel        # first run links the project; accept the defaults
npx vercel --prod # production deploy
```

Nothing else to configure: no database to provision, no build commands to
edit, no health-check wiring (`/api/health` exists if you want one).

## Sign-in accounts

Selecting a row in the Portal Accounts table on the sign-in page fills the
form.

| Email | Password | Role |
|---|---|---|
| `admin@aarav.edu` | `aarav123` | College Admin — Aniket Institute of Technology (has a live 2027-28 draft) |
| `office@aarav.edu` | `aarav123` | College Staff — uploads only |
| `admin@malwa.edu` | `malwa123` | College Admin — Malwa College of Engineering (the clean file) |
| `officer@aicte.demo` | `officer123` | Scrutiny Officer |
| `senior@aicte.demo` | `senior123` | Senior Officer (records decisions) |
| `sysadmin@aicte.demo` | `admin123` | System Admin (thresholds, connectors, reset) |
| `auditor@aicte.demo` | `audit123` | Auditor (read-only) |

Suggested first walk: sign in as the Scrutiny Officer → the queue is
risk-ordered, Aniket first (100, 14 open findings) → open the file → each
finding opens its evidence; Sah stays at 0 with no false flags. Then, as
Aniket College Admin, open the 2027-28 draft and upload the unsigned
affidavit to see the gate return it with the fix.

## Portal Assistant (chat)

- **Default (`CHAT_PROVIDER` unset or `local`)**: answers from the
  built-in portal guide (`lib/kb.js`) — every page, every status, every
  gate-return and its fix, the room-scan flow, officer actions, admin
  thresholds. No key, no external calls.
- **Gemini** (free key from Google AI Studio → *Get API key*):
  ```
  CHAT_PROVIDER=gemini
  GEMINI_API_KEY=...            # server-side only
  GEMINI_MODEL=gemini-2.0-flash # optional
  ```
- **Grok / xAI** (key from console.x.ai → API Keys):
  ```
  CHAT_PROVIDER=grok
  XAI_API_KEY=...               # server-side only
  XAI_MODEL=grok-3-mini         # optional
  ```
With a provider on, retrieved guide sections are sent as grounding
context and the model must answer from them; any provider error falls
back silently to the local answer. Set these in `.env.local` for local
runs or in Vercel → Settings → Environment Variables. See `.env.example`.

## How data works

The initial dataset (8 institutions, 9 applications, 70 checklist items,
computed findings/risk/audit) ships as `lib/seed/db.json` and is cloned
into an in-memory store (`lib/store.js`) at boot. All interactions —
uploads, validation runs, finding actions, scans, decisions, admin
changes — mutate that store. On serverless hosts the store lives while
an instance stays warm and returns to the initial dataset on a cold
start; **System Admin → Admin → Reset data** restores it on demand (and
signs everyone out). Login uses stateless HMAC tokens (`AUTH_SECRET`),
so there is no sessions table and no database to run.

For permanent persistence later, replace `lib/store.js` with a hosted
database (Turso/libSQL keeps the same table shapes; Vercel Postgres also
works) and keep uploads in Vercel Blob — the engines, API routes and UI
do not change. Real-file uploads today store metadata and the image
perceptual hash (via `sharp`) rather than the file binary.

## Project structure

```
app/
  layout.js              GOV-3 portal shell (header/nav/footer) + script/style loading
  page.js                mount point (views render into #main-content)
  api/[...path]/route.js entire JSON API (explicit dispatch table) + POST /api/chat
lib/
  engines.js             M1–M7 validation engines (pure functions)
  pipeline.js            validation orchestrator, desk files, faculty/finance, trust graph
  store.js               seeded in-memory store, audit chain, serialisers
  auth.js                HMAC bearer tokens, role guards
  kb.js / chat.js        portal-guide chunks + local/Gemini/Grok answerers
  seed/db.json           initial dataset
public/
  app.js                 portal views (hash router), calls /api/*
  styles.css             GOV-3 royal-blue stylesheet
  chat.js / chat.css     floating assistant widget
  assets/eoa-checklist.csv   the 70-item checklist download
qa/                      verification screenshots
```

Validation rules are configuration, not code: SFR target, room tolerance,
pHash distance, Benford minimum/MAD limit, dummy-teacher windows, cadre
ratio, risk weights and connector modes all live in **Admin → thresholds**
and are versioned in the audit trail when changed.
