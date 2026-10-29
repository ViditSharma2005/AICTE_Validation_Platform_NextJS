# ASTRA V2 — scope note and acceptance checklist

This note records the V2 brief that this branch was built against, and what
was actually verified before the commit. The original message is in the
project conversation; this file is the working checklist that the build and
the tests were run against, kept in the repository so the scope can be
audited later. Where a line says **verified**, the evidence is a scripted
check or a captured response, not an impression.

## Scope

1. **Delta Processing Cache** — stable content hash, rule versioning, cache
   keyed per application and checklist item, four outcomes, a summary on
   validation, badges on documents, a strip in both file views.
2. **MAC / network fingerprinting** — salted device fingerprints, declared
   versus observed estates, overlap between institutions, two new findings,
   three new API routes, a "Network evidence" section, graph edges.
3. **Improved bilingual chatbot** — new widget, EN/HI inside the widget and
   in sync with the site language, `/api/chat` taking `{message, lang}`,
   suggestion chips, deep links, source badge, copy/clear, keyboard and
   screen-reader behaviour, full-screen on handhelds.
4. **Camera-based room scan** — real `getUserMedia`, corner marking,
   calibration, homography area estimate, frame hash, geofence, graceful
   fallback, honest wording about what the method is.
5. **Full Hindi / English interface** — dictionary plus pattern layer,
   observer for late-rendered sections, formal Devanagari, evidence text
   left in the language it was recorded in.
6. **Complete responsive design** — 320–360 px, 390×844, 768×1024, 1024,
   1440×900; no unintended horizontal overflow; 44 px targets.
7. **Housekeeping** — no-cache headers for the new static assets, README,
   `.env.example`.

Preserved throughout: the GOV-3 shell and palette, the M1–M7 rules, the
demo accounts, the seeded dataset and every demo number.

## Non-negotiable demo numbers (checked on a cold start)

| Thing | Expected |
|---|---|
| Institutions / applications / checklist items | 8 / 9 / 70 |
| Officer queue buckets | 100 / 50 / 20 / 10 / 10 |
| Aarav (app 2) | risk 100, 14 open findings (7 High, 7 Medium) |
| Malwa (app 3) | risk 0, 0 findings |
| Faculty, CSE | declared 31, verified 28, required 36, shortfall 8, 720 students, SFR target 20 |
| Benford | MAD 0.1007, n = 160 |
| FDR | bank Rs 3,500,000 vs accounts Rs 5,000,000, agree = false |
| Fire certificate | FS/PN/2214, submitted expiry 2027-03-31, source 2025-03-31 |
| NAAC | submitted A+ / 3.41, source B++ / 2.78 |
| Classroom C-204 | 58.24 → 50.02 sq m, −14.1 %, Out of tolerance |
| Photo reuse | Hamming 3 of 64 |
| Shared professor | Dr. Radhika Nair, PAN DMOSM1100Q (Aarav + Janata) |
| Shared land deed | LND-MH-8841 |
| College payload | never carries `true_l`, `true_w` or `challenge_code` |
| RBAC | Scrutiny Officer 403 on a decision; Senior Officer succeeds |

## What was verified, and how

**Delta cache.** Validation run twice without changes returns
`new_flags 2` then `0` (idempotent) with `auto_passed 4`. Changing a
threshold through `PUT /api/admin/config` moves `rule_version` 1 → 2 and
the next run reports `rechecked 4, auto_passed 0`; a later run reports
`auto_passed 4` again. Re-uploading different content under the same
checklist item reports `modified 1` and `delta_status: Modified —
re-verified`. A desk-file upload with `force_manual` returns both
`delta_status` and `delta`.

**Network.** Aarav (app 2) reports 180 observed against 240 declared
(−25 %), Jaccard 0.2034 with Janata over 60 shared fingerprints, and
carries `MAC-COUNT` plus `MAC-OVERLAP-4`, both Medium. Malwa is clean
(245 observed of 260, −5.8 %). A college admin submitting a polling window
re-reports the same estate and advances the day instead of inventing
growth; the officer request path works and is audited.

**Camera scan.** Replay still reports −14.1 % "Out of tolerance". Camera
mode with four corners and a calibration is accepted (−15.3 %, inside the
geofence, frame hash present, `source` honest). An incomplete payload is
rejected with `400` and the specific reason; a wrong challenge code is
rejected with its own message; a College Staff account is refused with
`403`; the college payload leaks none of `true_l`, `true_w`,
`challenge_code`.

**Assistant.** English and Hindi questions both answer; Hindi answers in
Devanagari; `source` is `local` with no key configured; links are present.
An off-topic question ("weather in Paris") returns the honest fallback
instead of a guess.

**Interface.** A jsdom harness drives the real scripts against the running
server: sign-in, officer queue, officer file (delta strip, network section,
trust graph, faculty), document page, every public route, the Hindi toggle
(Devanagari on headings, nav, tables, labels), back to English, and the chat
widget (chips, answer, source badge, deep links, Hindi answer, Escape to
close) — with zero console errors.

**Responsive.** Checked as a stylesheet audit rather than a browser run:
a headless browser could not be installed in the build environment
(no Chromium binary is downloadable there), so the responsive layer was
verified by rule coverage across 1100/1024/900/768/560/420/360 px and by
confirming every table sits inside a `.table-scroll` panel. This limitation
is stated in the delivery note rather than papered over.

## Honest boundaries

- The campus polling agent is simulated on both sides; the fingerprints and
  counts are real functions of seeded data, and the API is the contract a
  real agent would use. No SNMP or ARP discovery happens.
- The camera scan is single-view perspective photogrammetry from four
  marked corners, with an assumed 65° horizontal field of view and one
  tape calibration — not ARCore depth. It is labelled as such in the
  interface.
- The dataset is in memory; a cold start restores the seed. Reset data does
  the same on demand.
- "Verified" means the submitted values match the issuing authority's
  record. It is never a claim of genuineness, and no decision is automated.
