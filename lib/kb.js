/* Portal guide knowledge base for the help assistant.
   Every answer is grounded in these chunks: navigation, workflows, and
   "document failed → how to fix it" guidance. With no API key configured,
   retrieval over these chunks answers directly; with Gemini/Grok enabled,
   the top chunks are given to the model as the only allowed context. */

export const KB = [
  {
    id: "overview",
    title: "What this portal does",
    keywords: "what is this portal overview eoa extension of approval purpose home start begin",
    text:
      "This is the AICTE Application Validation and Compliance Portal for Extension of Approval (EoA). Institutions upload their EoA documents and get item-wise feedback before submission. Officers review the same file with every finding linked to evidence — the field read from the document, the issuing authority's record, and the rule applied. Findings are advisory; the final decision is always recorded by a Senior Officer.\nTo begin: sign in from the home page. Colleges land on their applications, officers on the work queue, the System Admin on the rules console.",
    links: [{ label: "Go to sign in", href: "#/login" }, { label: "View the 70-item checklist", href: "#/checklist" }],
  },
  {
    id: "signin",
    title: "Signing in and portal accounts",
    keywords: "sign in login log in account password email credentials accounts roles officer college admin auditor",
    text:
      "Sign in from the home page with an email and password. Selecting a row in the Portal Accounts table fills the form for you.\nAccounts configured on this portal:\n• admin@aarav.edu / aarav123 — College Admin, Aniket Institute of Technology\n• office@aarav.edu / aarav123 — College Staff (uploads only)\n• admin@malwa.edu / malwa123 — College Admin, Malwa College of Engineering\n• officer@aicte.demo / officer123 — Scrutiny Officer\n• senior@aicte.demo / senior123 — Senior Officer (records decisions)\n• sysadmin@aicte.demo / admin123 — System Admin (rules and thresholds)\n• auditor@aicte.demo / audit123 — Auditor (read-only)\nInstitutions and officers use the same form; the portal opens on the side your role belongs to.",
    links: [{ label: "Go to sign in", href: "#/login" }],
  },
  {
    id: "login-trouble",
    title: "Sign-in is failing",
    keywords: "cannot login sign in failed wrong password invalid credentials error session expired signed out",
    text:
      "If sign-in fails with 'Email or password does not match a portal account':\n1. Check the email is typed exactly as in the Portal Accounts table on the sign-in page (selecting the row fills both fields).\n2. Passwords are case-sensitive — check Caps Lock.\n3. If you were signed in and suddenly land back on the sign-in page, the dataset may have been reset by the System Admin, which ends all sessions. Sign in again with the same account.\n4. If the page does not respond at all, reload once and retry.",
    links: [{ label: "Back to sign in", href: "#/login" }],
  },
  {
    id: "navigation",
    title: "Finding your way around (menu map)",
    keywords: "navigation menu where is page find navigate dashboard documents alerts audit reports admin help checklist",
    text:
      "Top menu, after sign-in:\n• Home / Dashboard — colleges: your applications; officers: the risk-ordered work queue; System Admin: the rules console.\n• Compliance Checklist — all 70 EoA items with verification type, source and clause; CSV download included.\n• Documents — one register of every filed document with its verification status.\n• Reports — validation case studies and portal figures.\n• Alerts — expiry notices, evidence requests, scan requests and high-severity findings for your role.\n• Audit Trail — every significant action, hash-chained.\n• Help — FAQs and account list.\n• Admin (System Admin only) — thresholds, connector modes, checklist rules, users, data reset.\nThe search box in the header searches colleges, cities, checklist items and help text.",
    links: [{ label: "Compliance Checklist", href: "#/checklist" }, { label: "Help and FAQs", href: "#/help" }],
  },
  {
    id: "create-application",
    title: "Starting a new application (college)",
    keywords: "create new application draft start application category academic year college admin apply eoa renewal",
    text:
      "Only a College Admin can start an application.\n1. Sign in as College Admin and open Dashboard.\n2. Under 'Start an application', choose the category (for example 'Extension of Approval (renewal)') and the academic year.\n3. Select 'Create draft'. The draft opens with the 70-item checklist progress and the upload section.\nCollege Staff accounts can upload into an existing draft but cannot create or submit applications.",
    links: [{ label: "Open Dashboard", href: "#/college" }],
  },
  {
    id: "upload",
    title: "Uploading a document",
    keywords: "upload document file add attach submit document desk files computer m1 gate check",
    text:
      "To file a document:\n1. Open your application from the Dashboard.\n2. Go to section '02 · Upload — M1 checks at the gate'.\n3. Choose 'Desk files' for a document already prepared, or 'A file from this computer' to pick a PDF/JPG/PNG/XLSX/CSV (up to 15 MB).\n4. Confirm the checklist item the file belongs to — the desk list sets it automatically, but check it matches.\n5. Select 'Upload and check'. The gate reader checks required fields, dates and signatures immediately and tells you the outcome on the same screen: Accepted, Returned for fix, or Filed for manual review.\nUploading a document for a checklist item replaces the earlier copy filed under that item.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "m1-signature",
    title: "Fix: document returned — signature not detected",
    keywords: "returned for fix signature not detected missing signature unsigned affidavit rejected bounce m1 fix",
    text:
      "A return at the gate is a request to fix and re-upload — it is not a rejection of your application.\n'Signature not detected on the execution page' means the signature/stamp region of the document appears empty. To fix it:\n1. Use the signed original of the document (for Affidavit 2, the copy signed by the deponent before the notary).\n2. Re-scan so the signature page is included and legible.\n3. Upload again under the same checklist item.\nIf the signature is genuinely present but faint, use 'The reader is wrong — submit anyway for manual review' on the result panel; the document is then filed and an officer reads it by hand.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "m1-stamp",
    title: "Fix: document returned — wrong e-Stamp value",
    keywords: "estamp stamp value 100 500 rs stamp paper affidavit returned fix wrong stamp",
    text:
      "'e-Stamp value read as Rs 100; this affidavit requires Rs 500 stamp paper' means the affidavit was executed on stamp paper of the wrong denomination. Accepted values are Rs 500 (or Rs 1000).\nTo fix it:\n1. Execute the affidavit on Rs 500 e-Stamp paper and have it signed and notarised.\n2. Upload the corrected copy under the same checklist item.\nThe e-Stamp number itself is later compared with the e-Stamp registry during source verification, so use the final executed copy.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "m1-field",
    title: "Fix: document returned — required field not found",
    keywords: "required field not found missing field date page faint scan lowres partly legible returned fix m1",
    text:
      "'Required field not found' means the reader could not find a named field (for example an execution date or certificate number) in the copy. Common causes: a missing second page, a faint or low-resolution scan, or the wrong checklist item selected.\nTo fix it:\n1. Confirm the checklist item chosen matches the document.\n2. Re-scan the complete document at readable quality, all pages.\n3. Upload again. If the value is present but still unreadable to the reader, use 'submit anyway for manual review' — an officer will read the copy by hand and your application is not held back by the reader.",
    links: [{ label: "See required items on the checklist", href: "#/checklist" }],
  },
  {
    id: "manual-review",
    title: "What 'Filed for manual review' means",
    keywords: "manual review submit anyway reader is wrong force accepted with manual review low confidence",
    text:
      "'Filed for manual review' means the document is safely in your file and an officer will read this copy by hand instead of relying on the automatic reader.\nThis happens when extraction confidence is low, when you choose 'The reader is wrong — submit anyway for manual review' after a return, or when you upload your own file from your computer. It is a normal route, not a penalty: a document is never blocked only because the reader struggled with it.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "file-limits",
    title: "Fix: file type or size not accepted",
    keywords: "file type not accepted 15 mb too large format pdf jpg png xlsx csv upload error fix",
    text:
      "For files from your computer, accepted types are PDF, JPG, PNG, XLSX, CSV and TXT, up to 15 MB.\nIf your file is refused:\n1. Convert Word or other formats to PDF before uploading.\n2. If the file is over 15 MB, compress the PDF or reduce scan resolution (150–200 DPI is enough for reading).\n3. Photographs from a phone (JPG/PNG) are hashed immediately so a reused photo can be recognised later.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "statuses",
    title: "What the verification statuses mean",
    keywords: "status verified mismatch expired verification pending source unavailable declared manual review meaning",
    text:
      "Each document carries one honest status:\n• Verified — the values read from your copy match the issuing authority's record. Nothing stronger is claimed; it does not mean 'genuine'.\n• Mismatch detected — at least one field differs from the source record; the document page shows both values side by side.\n• Expired — the validity date in the source record has passed; a renewed certificate is needed.\n• Verification pending — no matching source record was found for the identifiers read, or the connector is in live mode awaiting credentials.\n• Source unavailable — the connector for that source is switched off.\n• Declared (not verifiable) — no outside source exists for this document; it is taken as declared, never upgraded.\n• Manual review required — an officer will read the copy by hand.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "fix-mismatch",
    title: "Fix: document shows 'Mismatch detected'",
    keywords: "mismatch detected fix wrong value grade cgpa expiry date source record differs how to correct",
    text:
      "'Mismatch detected' means a value on the submitted copy differs from the issuing authority's record (for example a NAAC grade or a certificate expiry date).\nTo fix it:\n1. Open the document page — the table shows 'As submitted' against 'Issuing authority holds' for every field.\n2. File the copy that matches the source record (the registrar's copy, not a re-typed or framed copy). Uploading under the same checklist item replaces the earlier copy.\n3. Run the pre-submission check again to confirm the status clears.\nIf you believe the source record itself is wrong, leave the document filed and note it for the officer — officers can accept a finding with recorded reasons.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "fix-expired",
    title: "Fix: document shows 'Expired'",
    keywords: "expired certificate validity ended renewal fire safety fix expired document",
    text:
      "'Expired' means the validity date in the issuing authority's record has passed — most often the fire safety certificate.\nTo fix it:\n1. Obtain the renewed certificate from the issuing authority.\n2. Upload the renewed copy under the same checklist item (it replaces the old one).\n3. Run the pre-submission check; the finding clears once a valid, matching certificate is on file.\nNote: editing the date on a scan does not help — the portal compares against the source record's date, and editing indicators are flagged for officer review.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "presubmit",
    title: "Pre-submission check and submitting",
    keywords: "pre-submission check run validation submit application before you submit findings fix first",
    text:
      "Inside your draft, section '03 · Before you submit':\n1. Select 'Run pre-submission check'. This runs the same source comparisons, image checks, faculty arithmetic and finance tests the officers will see.\n2. Fix what you can — the screen lists deep-check items not yet filed and your open findings by severity.\n3. When ready, select 'Submit application to AICTE' (College Admin only). Submission moves the file to 'Under officer review' and runs validation once more.\nFixing issues here costs minutes; after submission the same fixes move through officer clarification requests.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "officer-queue",
    title: "Officer work queue and risk scores",
    keywords: "officer queue work list risk score order priority filter search state status risk high medium low",
    text:
      "Officers land on the Work Queue. Applications are ordered by risk score (highest first) so the files most needing attention come first. The score only orders the queue — it never decides anything.\nThe score is built from open findings using configured weights per severity; resolving or accepting findings lowers it immediately.\nUse the filters (search text, state, status, risk level) to narrow the list. Select any row to open the full application file with findings, faculty, finance, rooms and the trust graph.",
    links: [{ label: "Open the work queue", href: "#/officer" }],
  },
  {
    id: "flag-actions",
    title: "Acting on a finding (officers)",
    keywords: "flag finding accept clarification requested escalate resolve reopen officer notes action",
    text:
      "Open the application file and use the action row under each finding:\n• Accept — the explanation is on record; the finding stops counting toward risk.\n• Request clarification — the college is alerted ('Evidence requested') and the application moves to 'Awaiting college response'.\n• Escalate — keeps the finding counting toward risk and marks it for senior attention.\n• Resolve — the issue is closed (for example, a corrected document has been filed).\n• Reopen — returns a finding to Open.\nAdd officer notes so the reasoning is on the record; every action is written to the audit trail and the risk score updates at once.",
    links: [{ label: "Open the work queue", href: "#/officer" }],
  },
  {
    id: "decision",
    title: "Recording the decision (Senior Officer)",
    keywords: "decision senior officer eoa recommended conditions not recommended inspection before decision final approve reject",
    text:
      "Only a Senior Officer can record the decision, and only this step is a decision — everything before it is evidence.\n1. Open the application file from the work queue.\n2. In the decision section, choose one of the four recorded outcomes: 'EoA recommended', 'EoA recommended with conditions', 'Inspection before decision', or 'Not recommended'.\n3. Add decision notes and confirm. The application moves to 'Decision recorded', the college is alerted, and the decision is audit-logged under the officer's name.\nScrutiny Officers prepare the file (findings, scan requests, inspection recommendations) but cannot record this step.",
    links: [{ label: "Open the work queue", href: "#/officer" }],
  },
  {
    id: "inspection",
    title: "Recommending a physical inspection",
    keywords: "recommend inspection physical visit site inspection recommended officer",
    text:
      "A Scrutiny or Senior Officer can select 'Recommend inspection' on an application file. The application moves to 'Inspection recommended', both sides are alerted, and the action is audit-logged.\nHigh risk files and out-of-tolerance room measurements point this way, but the recommendation itself is always a human action — the portal only assembles the evidence.",
    links: [{ label: "Open the work queue", href: "#/officer" }],
  },
  {
    id: "document-page",
    title: "Reading a document page",
    keywords: "document page view fields source comparison forensic editing indicator heatmap region evidence extracted",
    text:
      "Selecting 'view' beside any document (or a row in the Documents register) opens its page:\n• The filed copy with the fields read from it and the extraction confidence.\n• Source verification: each field 'As submitted' against 'Issuing authority holds', marked Match, Mismatch or Not submitted, with the source name and lookup mode.\n• Editing indicators (where present): the signals found, with the affected region marked on the page. One weak signal can only raise a Low finding; High needs two independent signals — indicators are for human verification, never proof of editing.\n• Findings raised against this document, with their evidence and confidence.\nOpening a document is itself recorded in the audit trail.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "faculty",
    title: "Faculty section: SFR, cadre and dummy-teacher signals",
    keywords: "faculty sfr student faculty ratio cadre verified declared dummy teacher epfo payroll degree mismatch e1 shortfall",
    text:
      "The Faculty section of an application file shows the CSE register name by name and computes ratios over VERIFIED teachers only — so rows that fail checks stop helping the numbers.\nA teacher is not counted when: the claimed degree has no record in DigiLocker / ABC-NAD; the person is absent from the salary sheet; there is no EPFO contribution history with this employer; or they joined within the configured window before the application at very low pay (a dummy-teacher pattern for officer review).\nThe header compares verified faculty against the number required at the configured student–faculty ratio, with the cadre split (Professor / Associate / Assistant). Uploading checklist item E1 loads the register; until then the section explains that no register is filed.",
    links: [{ label: "Open an application file", href: "#/officer" }],
  },
  {
    id: "finance",
    title: "Finance section: Benford test and FDR reconciliation",
    keywords: "finance benford mad ledger digits fdr reconciliation bank accounts rpgf totals subtotal c1 c3",
    text:
      "The Finance section runs two independent tests over the audited accounts (checklist C1):\n• Benford's Law on the first digits of ledger amounts. It needs at least the configured minimum of usable numbers (100); below that it honestly reports 'Insufficient data' and raises nothing. Non-conformity alone never raises a High finding — it is evidence for audit review.\n• Arithmetic integrity: whether schedule subtotals add to their stated totals.\nAnd a three-way reconciliation of the FDR/RPGF amount across the bank record, the audited accounts schedule, and the figure declared in the application (C3). Any disagreement is listed with all three values.",
    links: [{ label: "Open an application file", href: "#/officer" }],
  },
  {
    id: "graph",
    title: "Trust graph: cross-college reuse",
    keywords: "trust graph shared faculty land deed photo reuse cross college same professor parcel m7 red links",
    text:
      "The trust graph on an application file draws the institution, its trust, and anything shared with other colleges:\n• The same person filed as full-time faculty by two institutions (matched on a salted PAN hash — the PAN itself is only ever shown masked).\n• The same registered land deed filed by two campuses.\n• A near-identical laboratory photograph filed by another institution (perceptual hash distance shown).\nRed links are reuse that a single-document check cannot see. Plain links (one trust running several colleges) are context, not an offence. Selecting a link leads to the related application or document.",
    links: [{ label: "Open the work queue", href: "#/officer" }],
  },
  {
    id: "room-scan",
    title: "Room measurement (AR scan): full flow",
    keywords: "room scan ar measurement request scan challenge code geofence tolerance consistent out of tolerance classroom area",
    text:
      "Room measurement is officer-led, in two halves:\nOfficer side: open the application file, find the rooms section, and select 'Request scan' for any room from the approved building plan. You receive a 4-character challenge code — read it to the person who will scan; it is never shown on the college side.\nCollege side: the scan request appears in your notices and in the room's row. Open it, type the challenge code exactly as the officer read it, then submit the recorded AR session replay, or switch to manual entry and type the measured length and width in metres (0.5–100 m).\nThe portal compares measured carpet area with the claimed area. Within the configured tolerance (5%) the result is 'Consistent'. Outside it, the result is 'Out of tolerance' and a finding recommends a physical inspection — it is advisory, never a fraud finding.\nThe scan's GPS must fall inside a 600 m geofence around the declared campus centre; a scan taken elsewhere is marked invalid until repeated on site.",
    links: [{ label: "Officer: open a file to request a scan", href: "#/officer" }, { label: "College: open your file to scan", href: "#/college" }],
  },
  {
    id: "scan-errors",
    title: "Fix: room scan problems (challenge code / geofence)",
    keywords: "challenge code does not match wrong code scan error geofence outside 600 invalid scan no open request fix",
    text:
      "• 'Challenge code does not match' — the code is typed differently from the one on the officer's screen. Ask the officer to read it again and retype; codes use letters and digits without easily confused characters.\n• 'No officer scan request is open for this room' — an officer must request the scan first (officer picks the room). Ask for a fresh request if a previous scan already closed it.\n• Scan marked outside the geofence — the submitted GPS sits more than 600 m from the declared campus centre. Repeat the scan on site; the earlier scan stays on record as invalid until replaced.\n• 'Out of tolerance' — measured area differs from the plan by more than the tolerance. That is a trigger for a physical inspection, not an accusation; if the building plan itself was corrected, file the approved revised plan and explain it to the officer.",
    links: [{ label: "Open your applications", href: "#/college" }],
  },
  {
    id: "alerts",
    title: "Alerts",
    keywords: "alerts notifications notices evidence requested expired scan requested decision mark seen",
    text:
      "The Alerts menu lists what needs attention for your role: evidence/clarification requests, expired documents, scan requests and results, missing mandatory documents, high-severity findings (officers), new submissions (officers) and recorded decisions.\nColleges see only their own institution's alerts. Select 'Mark seen' to clear an alert from your outstanding counts; the underlying finding or request stays visible inside the application file until it is acted on.",
    links: [{ label: "Open Alerts", href: "#/alerts" }],
  },
  {
    id: "audit",
    title: "Audit trail and the hash chain",
    keywords: "audit trail hash chain tamper log history who did what timeline record",
    text:
      "The Audit Trail records every significant action: sign-ins, uploads, gate returns, validation runs, finding actions, scan requests and submissions, decisions, and rule changes.\nEntries are hash-chained: each row carries a SHA-256 hash computed over the previous row's hash plus its own contents, so altering any past entry breaks the chain from that point on. Inside an application file, the same log appears as the file's Timeline. Colleges see entries for their own institution only.",
    links: [{ label: "Open Audit Trail", href: "#/audit" }],
  },
  {
    id: "checklist",
    title: "The 70-item compliance checklist",
    keywords: "checklist 70 items groups mandatory deep validation csv download clause verification type source",
    text:
      "The Compliance Checklist page lists all 70 Extension of Approval items in groups A–I (Legal & trust, Land & building, Financial, Approvals, Faculty & HR, Infrastructure, Website disclosure, Committees, Accreditation). Each row shows the verification type, the source it is checked against, the checks that run, and whether it is mandatory.\nDeep validation (full source comparison and rule checks) runs on the priority slice marked on the page; the remaining items are checked for presence, dates and declarations and marked accordingly.\nThe same list is available as a CSV download from the checklist page and the home page quick links.",
    links: [{ label: "Open the checklist", href: "#/checklist" }],
  },
  {
    id: "documents-register",
    title: "Documents register",
    keywords: "documents register repository all documents list statuses search filed copies",
    text:
      "The Documents menu is one register of every document across the applications you may see, with its checklist item, verification status and a link into the document page. It is the fastest way to answer 'show me every Mismatch' or 'which fire certificates are on file' without opening files one by one.",
    links: [{ label: "Open Documents", href: "#/documents" }],
  },
  {
    id: "search",
    title: "Using search",
    keywords: "search header box find college city checklist item help results",
    text:
      "The search box in the header searches across institutions (name, city, state, trust), checklist items and help text. Results group what was found and link straight to it. Inside the officer work queue, the filter row does the same job for the queue itself (text, state, status, risk level).",
    links: [{ label: "Try the checklist", href: "#/checklist" }],
  },
  {
    id: "admin",
    title: "Admin console: thresholds, connectors, rules",
    keywords: "admin system admin config thresholds sfr tolerance phash benford risk weights connectors registry live off checklist mandatory severity users reset",
    text:
      "System Admin → Admin console (officers and the Auditor can read the values; only the System Admin changes them):\n• Thresholds: SFR target, room-measurement tolerance %, pHash distance, Benford minimum sample and MAD limit, dummy-teacher windows (low-pay threshold, joined-recent days), cadre ratio, and the risk weights/levels that order the queue.\n• Connectors: each source can be 'registry' (answer from the connected register), 'live' (needs authorised credentials; requests queue as Verification pending) or 'off' (reports Source unavailable).\n• Checklist rules: set any item mandatory/optional and its missing-document severity.\n• Users: the account list with roles.\n• Reset data: restores the initial dataset and signs everyone out.\nEvery change is written to the audit trail. After changing thresholds, re-run validation on a file to see the effect.",
    links: [{ label: "Open Admin (System Admin)", href: "#/admin" }],
  },
  {
    id: "accessibility",
    title: "Language, text size and contrast controls",
    keywords: "Hindi English language toggle font size text bigger smaller high contrast screen reader accessibility",
    text:
      "The top utility bar carries the accessibility controls:\n• Language: 'अ' switches the portal shell to Hindi, 'A' back to English (finding text itself is issued in English).\n• Text size: A- / A / A+.\n• High Contrast: switch for a high-contrast rendering.\n• Screen Reader Access: notes for assistive technology users.\nYour choices are remembered on this browser. A 'Skip to main content' link is the first tab stop on every page.",
    links: [{ label: "Back to home", href: "#/" }],
  },
  {
    id: "case-studies",
    title: "Validation case studies (Reports)",
    keywords: "case studies scenarios reports examples walkthrough s1 s9 unsigned affidavit clean file control",
    text:
      "The Reports page lists nine worked validation cases present in this dataset and where each surfaces:\nS1 unsigned affidavit bounced at the gate · S2 fire certificate with an edited expiry date · S3 NAAC grade above the source record · S4 a classroom smaller than claimed · S5 ledger digit anomaly with a three-way FDR disagreement · S6 dummy teachers, an unmatched degree and a shared professor · S7 a laboratory photo reused after resizing · S8 one land deed in two applications · S9 a completely clean file (Malwa) that collects no findings — the control case.\nSign in with any account to open them. A good first walk: officer account → open the top file (Aniket) → read the findings in order.",
    links: [{ label: "Open Reports", href: "#/scenarios" }],
  },
  {
    id: "photo-reuse",
    title: "Photo reuse and editing indicators",
    keywords: "photo reused phash Hamming duplicate image near duplicate resize editing indicator ela metadata fix",
    text:
      "Laboratory photographs are fingerprinted with a 64-bit perceptual hash. If a near-identical image (within the configured Hamming distance) was filed earlier by another institution, the later copy is flagged as reuse — resizing or recompressing the photo does not evade it. To clear such a finding, file a fresh photograph of your own facility under the same checklist item and re-run the check.\nEditing indicators (for example recompression differences around a date field, or editor metadata) are treated cautiously: one signal raises at most a Low finding, two independent signals are needed for High, and the wording always asks for human verification.",
    links: [{ label: "Documents register", href: "#/documents" }],
  },
  {
    id: "missing-document",
    title: "Fix: 'Mandatory document not filed'",
    keywords: "missing mandatory document not filed finding fix which document upload item code",
    text:
      "This finding names the checklist item (for example 'B8 — Fire safety certificate') that a submitted application is missing.\nTo fix it:\n1. Open the application file and go to the Upload section.\n2. File the document under exactly that checklist item code.\n3. Run the pre-submission check (or ask the officer to re-run validation) — the finding stops being raised once the item is on file; the officer can then Resolve the original finding.\nDrafts with only a few documents do not collect these findings; they appear once an application is a real filing.",
    links: [{ label: "See all checklist items", href: "#/checklist" }],
  },
];

export const GREETING =
  "Namaste. I am the portal assistant. Ask me how to sign in, upload or fix a document, read a finding, run the room scan, or use any part of this portal — and I will answer with the exact steps.";

export const FALLBACK =
  "I do not have that in the portal guide yet. I can help with: signing in and accounts; uploading documents and fixing gate returns (signature, stamp value, missing fields, file type/size); verification statuses and how to clear a Mismatch or Expired; the pre-submission check; officer findings and decisions; faculty SFR and finance tests; the trust graph; the room measurement scan and its errors; alerts, audit trail, the checklist and the admin console. Try asking in a few words, for example 'signature not detected' or 'how does the room scan work'.";
