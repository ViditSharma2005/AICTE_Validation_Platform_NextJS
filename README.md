# AICTE Application Validation and Compliance Portal — Next.js

Extension of Approval (EoA) document validation for AICTE institutions:
checks at the upload gate, issuing-authority source comparison, editing
indicators and image-reuse detection, faculty ratio arithmetic over
verified teachers only, financial tests (Benford + three-way FDR
reconciliation), officer-requested room measurement, a cross-college
trust graph, and a hash-chained audit trail. Findings advise; a Senior
Officer records the only decision.

Version 2 (**ASTRA V2**) keeps the GOV-3 royal-blue government shell, the
M1–M7 rules and every demo number, and adds a delta processing cache,
network (MAC) evidence, a camera-based room measurement, a fully bilingual
interface with a bilingual assistant, and a responsive layer for 320 px to
1440 px.

Design: GOV-3 royal-blue government portal (DBIM v3.0 / GIGW 3.0 pattern)
— utility bar with language/text-size/contrast controls, announcements
ticker, breadcrumbs, four-column footer, bilingual (English/Hindi) shell.

A floating **Portal Assistant** (bottom-right "Help" bubble) answers
navigation and how-to questions ("my document was returned — how do I fix
it?") from a built-in portal guide, with deep links into the app. It works
with zero configuration; Gemini or Grok can be switched on via env vars.

---

## What ASTRA V2 adds

### 1. Delta processing cache

Every filed document gets a SHA-256 content hash over its normalised
extraction (`filename`, `fields`, `phash`). The cache is keyed
`application_id:checklist_code` and stores the hash, the verification
status, the rule version it was checked under, and a timestamp. A document
is carried forward — **Auto-passed (unchanged)** — only when the same
content was already verified, the rule version has not moved, and the
document has not expired. Anything else is re-checked in full:
**Modified — re-verified**, **Re-checked (rules updated)**,
**Re-checked (expiry reached)**, **New this cycle**.

- Any System Admin change to thresholds or checklist rules bumps
  `rule_version`, which invalidates the cache for the next run: findings
  that were auto-passed become `rechecked`, then auto-pass again once the
  rules are current.
- `GET /api/meta` exposes `rule_version`; every validation response and
  upload response carries `delta_status` and a `delta` summary; documents
  carry `delta_status` in list and detail serialisers.
- The college file and the officer file both show a delta strip
  (`#sec-delta`) with the four outcomes and the current rule version.

### 2. Network (device) evidence

Each institution declares a computer estate; the campus polling agent
reports which machines answer over a three-day window.

- Device identity is a **salted SHA-256 fingerprint** of the hardware
  address. The same machine produces the same fingerprint across
  institutions, and no raw MAC address is ever stored or displayed.
- `GET /api/applications/:id/network` returns declared versus observed
  counts, per-day sightings, stable/churn counts, variance against
  `mac_count_tolerance_pct` (default 10), and pairwise Jaccard overlap
  against `mac_jaccard_threshold` (default 0.10).
- `POST /api/applications/:id/network/request-poll` (officer) and
  `POST /api/applications/:id/network/submit-poll` (College Admin) open and
  answer a polling window.
- Findings: `MAC-COUNT` (Medium) when the observed estate is materially
  below the declared estate, `MAC-OVERLAP-<otherAppId>` (Medium) when the
  same physical machines are counted by two colleges. Both are evidence
  for an officer, not findings of ownership or fraud.
- The trust graph gains device edges, and the assistant's guide is updated.

### 3. Camera-based room measurement

`public/scan.js` exposes `window.CamScan`. The scan panel now offers three
modes: **Live camera measurement**, **Recorded replay**, and **manual**.

In camera mode the browser asks for `getUserMedia({video:{facingMode:"environment"}})`,
marks the four floor corners on a canvas overlay, calibrates one edge from
a real tape length, and estimates the area by four-point homography
rectification. A still frame is hashed with SubtleCrypto, geolocation is
compared with the campus geofence, all tracks are stopped when the panel
closes, and the payload is posted to `POST /api/rooms/:roomId/scan` with
`mode: "camera"`. Blocked or missing cameras fall back to replay/manual
with a plain explanation rather than a dead end.

### 4. Bilingual interface and assistant

- `public/i18n.js` (loaded after `app.js`) carries the EN→HI dictionary,
  pattern translations for strings with numbers, and a MutationObserver on
  the document body so late-rendered sections (faculty, finance, network,
  graph, toasts) are translated too.
- Stored evidence — finding reasons, registry values, file names, hashes,
  audit JSON — deliberately stays in the language it was recorded in, so
  quoted evidence is never rewritten. Every label around it is Hindi.
- `POST /api/chat` accepts `{message, lang}` and answers in formal
  Devanagari for `lang: "hi"`. The guide (`lib/kb.js` + `lib/kb.hi.js`) is
  bilingual; Gemini/Grok remain optional and fall back silently to the
  local answer.

### 5. Responsive layer

`public/responsive.css` (loaded after `styles.css`) handles 1100 / 1024 /
900 / 768 / 560 / 420 / 360 px: tables scroll inside `.table-scroll`
panels only, the section index becomes a horizontal strip, the deltas and
counters re-flow from four columns to two to one, the camera viewport
switches to portrait, the chat panel goes full-screen below 560 px, and
every button, input and chip keeps a 44 px target.

### API surface added in V2

| Method and path | Role | Purpose |
|---|---|---|
| `GET /api/applications/:id/network` | any signed-in role that can see the file | declared vs observed devices, per-day counts, overlap |
| `POST /api/applications/:id/network/request-poll` | Scrutiny / Senior Officer | ask the college for a fresh three-day window |
| `POST /api/applications/:id/network/submit-poll` | College Admin | submit the polling window reported by the campus agent |
| `POST /api/rooms/:roomId/scan` | College Admin | `mode: "camera"` accepted alongside `replay` and the manual form |
| `GET /api/meta` | public | now also returns `rule_version` for the delta cache |
| `POST /api/chat` | public | accepts `{message, lang}`; `lang: "hi"` answers in Devanagari |

Validation, upload and scan responses carry `delta_status` (and, for
uploads and validation, a `delta` summary) so the interface can explain
what was carried forward without a second request.

## Honest boundaries

- **Device polling is simulated on both sides.** The "campus polling agent"
  is a deterministic generator over the seeded estate; nothing performs
  SNMP or ARP discovery. The fingerprints, counts and overlap arithmetic
  are real functions of that data, and the API contract is the one a real
  agent would use.
- **The camera scan is photogrammetry, not ARCore.** It is a single-view
  perspective measurement from four marked floor corners with an assumed
  65° horizontal field of view and one tape-measured edge. It is good to a
  few percent in decent light and honest about its error; it is not a
  depth-sensor survey, and it never decides anything by itself.
- **Delta auto-passing never hides a change.** A document is only carried
  forward when the content hash, the rule version and the validity window
  all still agree; otherwise it is re-checked in full.
- **The dataset is in memory.** Writes live while an instance stays warm
  and reset on a cold start — System Admin → Reset data restores the seed
  deliberately.
- **Verified means "agrees with the source record", not "genuine".**
  Findings advise; only a Senior Officer records a decision, under their
  own name, and every significant action is written to the hash-chained
  audit trail.

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
| `admin@aarav.edu` | `aarav123` | College Admin — Aarav Institute of Technology (the flagged file, app 2) |
| `office@aarav.edu` | `aarav123` | College Staff — uploads only |
| `admin@malwa.edu` | `malwa123` | College Admin — Malwa College of Engineering (the clean file) |
| `officer@aicte.demo` | `officer123` | Scrutiny Officer |
| `senior@aicte.demo` | `senior123` | Senior Officer (records decisions) |
| `sysadmin@aicte.demo` | `admin123` | System Admin (thresholds, connectors, reset) |
| `auditor@aicte.demo` | `audit123` | Auditor (read-only) |

Suggested first walk: sign in as the Scrutiny Officer → the queue is
risk-ordered, Aarav first (100, 14 open findings) → open the file → each
finding opens its evidence; Malwa stays at 0 with no false flags. Then, as
the Aarav College Admin, open the 2027-28 draft and upload the unsigned
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
  kb.js / kb.hi.js       portal-guide chunks in English and Hindi
  chat.js                retrieval + local/Gemini/Grok answerers
  seed/db.json           initial dataset
public/
  app.js                 portal views (hash router), calls /api/*
  i18n.js                Hindi interface layer (dictionary + patterns + observer)
  styles.css             GOV-3 royal-blue stylesheet
  responsive.css         responsive layer, 1100 → 360 px
  scan.js                CamScan: camera capture, corner marking, measurement
  chat.js / chat.css     bilingual floating assistant
  assets/eoa-checklist.csv   the 70-item checklist download
qa/                      V1 screenshots, V2 DOM snapshots, the V2 scope note
```

Validation rules are configuration, not code: SFR target, room tolerance,
pHash distance, Benford minimum/MAD limit, dummy-teacher windows, cadre
ratio, risk weights and connector modes all live in **Admin → thresholds**
and are versioned in the audit trail when changed.
