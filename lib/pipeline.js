/* Validation pipeline: desk-file variants, document/faculty/finance
   persistence, the run_validation orchestrator (M1–M7), and the
   cross-college trust graph. */
import crypto from "node:crypto";
import * as E from "./engines.js";
import { now, jparse, getConfig, registryMap, audit, alert, addFlag, instById, checklistByCode } from "./store.js";
import { deltaState } from "./store.js";

/* ------------------------------- RNG --------------------------------------- */
/* Deterministic PRNG for the faculty/ledger generators used on upload
   side-effects. Sequences differ from CPython's Mersenne Twister but the
   distributions (and every rule outcome) are identical. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    choice: (arr) => arr[Math.floor(next() * arr.length)],
    randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive, like Python
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    choicesWeighted: (items, weights) => {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

/* --------------------------- faculty generator ----------------------------- */

function panHash(pan) {
  return crypto.createHash("sha256").update("salt-demo-" + pan, "utf8").digest("hex").slice(0, 16);
}
function panMasked(pan) {
  return pan.length >= 5 ? pan.slice(0, 3) + "**" + pan.slice(-2) : "****";
}

const FIRST = ["Amit", "Sunita", "Rahul", "Kavita", "Vikram", "Deepa", "Arjun Mehta", "Priya Nair", "Rohan", "Divya Sharma",
  "Nikhil Rao", "Ananya Iyer", "Karan Malhotra", "Shruti Desai", "Mohammed", "Lakshmi", "Sanjay Verma", "Revathi", "Aditya",
  "Nisha Kapoor", "Harish Chandra", "Pooja Singh", "Vivek Anand", "Kavya Reddy", "Rajat", "Swati", "Imran Sheikh", "Geeta",
  "Prakash", "Anita", "Deepak Yadav", "Reema", "Suraj Patel", "Komal", "Varun", "Meera"];
const LAST = ["Sharma", "Patel", "Iyer", "Deshmukh", "Ahmed Khan", "Rao", "Gupta", "Nair", "Joshi", "Reddy", "Khan",
  "Chatterjee", "Pillai", "Yadav", "Bose", "Menon", "Kulkarni", "Das", "Rathore"];
const UNIS = ["Savitribai Phule Pune University", "Devi Ahilya Vishwavidyalaya", "RTM Nagpur University",
  "APJ Abdul Kalam Technological University", "Anna University", "AKTU Lucknow"];
const PAN_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeFaculty(rng, total, profile) {
  const rows = [];
  const nProf = Math.max(1, E.roundPy((total * 1) / 9));
  const nAssoc = Math.max(2, E.roundPy((total * 2) / 9));
  const cadres = [
    ...Array(nProf).fill("Professor"),
    ...Array(nAssoc).fill("Associate Professor"),
    ...Array(Math.max(0, total - nProf - nAssoc)).fill("Assistant Professor"),
  ];
  const used = new Set();
  const usedPans = new Set();
  cadres.forEach((cadre, i) => {
    let name;
    do { name = `${rng.choice(FIRST)} ${rng.choice(LAST)}`; } while (used.has(name));
    used.add(name);
    let pan;
    do { pan = "DMO" + Array.from({ length: 6 }, () => PAN_CHARS[rng.randint(0, PAN_CHARS.length - 1)]).join(""); }
    while (usedPans.has(pan));
    usedPans.add(pan);
    const qual = cadre !== "Assistant Professor" || i % 4 === 0 ? "PhD" : "M.Tech";
    rows.push({
      name: (qual === "PhD" ? "Dr. " : "") + name,
      pan,
      designation: cadre,
      qualification: qual,
      university: rng.choice(UNIS),
      joining: `20${rng.randint(16, 24)}-0${rng.randint(1, 9)}-15`,
      department: "CSE",
      salary: rng.choice([52000, 61000, 78000, 95000, 118000, 142000]),
      degree_status: "Verified",
      payroll_status: "On payroll, PF deducted",
      epfo_status: "Contributions in last 3 months (EPFO)",
    });
  });
  if (profile === "hero") {
    Object.assign(rows[rows.length - 1], {
      name: "Guest Lecturer (unnamed row 31)", salary: 8000, joining: "2025-12-28",
      payroll_status: "No salary-sheet row found", epfo_status: "No contribution history (EPFO)",
      degree_status: "Declared (not verifiable)",
    });
    Object.assign(rows[rows.length - 2], {
      salary: 9500, joining: "2026-01-02", epfo_status: "No contribution history (EPFO)",
    });
    Object.assign(rows[3], {
      degree_status: "Mismatch detected", university: "Savitribai Phule Pune University",
      degree_note: "DigiLocker/ABC-NAD holds no M.Tech record for this name and year",
    });
    Object.assign(rows[0], { name: "Dr. Radhika Nair", pan: "DMOSM1100Q" }); // also filed elsewhere (M7)
  }
  if (profile === "shared") {
    Object.assign(rows[0], { name: "Dr. Radhika Nair", pan: "DMOSM1100Q", designation: "Professor" });
  }
  if (profile === "medium") {
    Object.assign(rows[rows.length - 1], { epfo_status: "No contribution history (EPFO)", joining: "2025-12-20" });
  }
  for (const r of rows) {
    r.pan_hash = panHash(r.pan);
    r.pan_masked = panMasked(r.pan);
  }
  return rows;
}

export function benfordNumbers(rng, n, fabricated) {
  /* Ledger amounts. The clean set is stratified to Benford first-digit
     proportions so a clean college never trips the test by sampling luck;
     the fabricated set clusters on 7/8 the way invented figures tend to. */
  const out = [];
  if (fabricated) {
    for (let i = 0; i < n; i++) {
      const first = rng.choicesWeighted([1, 2, 3, 4, 5, 6, 7, 8, 9], [4, 5, 6, 7, 8, 10, 30, 22, 8]);
      out.push(parseInt(`${first}${rng.randint(100, 999)}`, 10) * rng.choice([10, 100]));
    }
    return out;
  }
  for (let d = 1; d <= 9; d++) {
    const c = Math.max(1, E.roundPy(n * Math.log10(1 + 1 / d)));
    for (let i = 0; i < c; i++) out.push(parseInt(`${d}${rng.randint(10, 99)}`, 10) * rng.choice([100, 1000, 10000]));
  }
  rng.shuffle(out);
  return out.slice(0, n);
}

/* ------------------------- desk document variants -------------------------- */
/* Files on the college's desk. Fields stand in for OCR + layout extraction
   output, exactly as read from each document at the gate. */

export const LAB_PHASH = "1011010010110100110101101011010011010110101101001011010010110100";
// the reused copy differs by 3 bits after resize/recompression (CONFIG limit 8)
export const LAB_PHASH_COPY = [10, 40, 57].reduce(
  (acc, i) => acc.slice(0, i) + (LAB_PHASH[i] === "1" ? "0" : "1") + acc.slice(i + 1),
  LAB_PHASH
);

export function demoVariants(instName = "Aarav Institute of Technology") {
  const isAniket = instName.includes("Aniket");
  const fireCert = isAniket ? "FS/PN/2214" : "FS/IN/0931";
  const naacCert = isAniket ? "NAAC/MH/2023/1177" : "NAAC/MP/2024/0319";
  return {
    affidavit_missing_signature: {
      checklist_code: "A2", confidence: 0.93, scenario: "S1",
      label: "Affidavit 2 — unsigned copy from the office drawer",
      filename: "Affidavit-2_scan.pdf",
      fields: {
        deponent_name: "Meera Kulkarni", institution_name: instName,
        estamp_number: "IN-MH-55120983R", estamp_value_inr: "100",
        notary_name: "R. Bhosale, Notary Pune", execution_date: "2026-01-05",
        signature_present: false,
      }, forensic: [], phash: "",
    },
    affidavit_clean: {
      checklist_code: "A2", confidence: 0.96, scenario: "",
      label: "Affidavit 2 — signed original on Rs 500 e-Stamp paper",
      filename: "Affidavit-2_signed.pdf",
      fields: {
        deponent_name: "Meera Kulkarni", institution_name: instName,
        estamp_number: "IN-MH-55120983R", estamp_value_inr: "500",
        notary_name: "R. Bhosale, Notary Pune", execution_date: "2026-01-05",
        signature_present: true,
      }, forensic: [], phash: "",
    },
    fire_edited: {
      checklist_code: "B8", confidence: 0.91, scenario: "S2",
      label: "Fire safety certificate — the scan the office has",
      filename: "FireSafety_2025.pdf",
      fields: {
        certificate_number: fireCert, institution_name: instName,
        issuing_authority: isAniket ? "Pune Municipal Fire Brigade" : "Indore Fire Services",
        issue_date: isAniket ? "2024-04-01" : "2026-04-01",
        expiry_date: "2027-03-31",
        premises_address: isAniket ? "Survey 44, Hinjewadi Phase 2, Pune" : "Ring Road Campus, Indore",
      },
      forensic: [
        { signal: "ELA: recompression level around the expiry-date field differs from the rest of the page", region: { x: 40, y: 71, w: 26, h: 8 } },
        { signal: "PDF metadata: modified 2025-11-02 with an image editor; created 2024-04-03 by scanner software", region: null },
      ],
      phash: "",
    },
    fire_renewed: {
      checklist_code: "B8", confidence: 0.94, scenario: "",
      label: "Fire safety certificate — renewed certificate, fresh scan",
      filename: "FireSafety_renewed.pdf",
      fields: {
        certificate_number: "FS/PN/3099", institution_name: instName,
        issuing_authority: "Pune Municipal Fire Brigade",
        issue_date: "2026-04-01", expiry_date: "2027-03-31",
        premises_address: "Survey 44, Hinjewadi Phase 2, Pune",
      }, forensic: [], phash: "",
    },
    naac_inflated: {
      checklist_code: "I1", confidence: 0.95, scenario: "S3",
      label: "NAAC certificate — framed copy from the office wall",
      filename: "NAAC_Certificate.pdf",
      fields: {
        certificate_number: naacCert, institution_name: instName,
        grade: isAniket ? "A+" : "A", cgpa: isAniket ? "3.41" : "3.18",
        cycle: "2", valid_until: isAniket ? "2028-02-14" : "2029-06-30",
      }, forensic: [], phash: "",
    },
    naac_true: {
      checklist_code: "I1", confidence: 0.95, scenario: "",
      label: "NAAC certificate — registrar's copy",
      filename: "NAAC_Certificate.pdf",
      fields: {
        certificate_number: naacCert, institution_name: instName,
        grade: isAniket ? "B++" : "A", cgpa: isAniket ? "2.78" : "3.18",
        cycle: "2", valid_until: isAniket ? "2028-02-14" : "2029-06-30",
      }, forensic: [], phash: "",
    },
    land_deed: {
      checklist_code: "B1", confidence: 0.92, scenario: isAniket ? "S8" : "",
      label: "Registered land deed LND-MH-8841",
      filename: "LandDeed_8841.pdf",
      fields: { registration_number: "LND-MH-8841", owner: "Shikshan Seva", area_acres: "6.4", survey_no: "44/2 Hinjewadi" },
      forensic: [], phash: "",
    },
    accounts_fabricated: {
      checklist_code: "C1", confidence: 0.9, scenario: "S5",
      label: "Audited accounts with ledger extract",
      filename: "AuditedAccounts_3yr.pdf",
      fields: {
        ca_firm: "Bhandari & Co., Chartered Accountants", udin: "26-UDIN-884120",
        financial_years: "2022-23, 2023-24, 2024-25",
        total_income_inr: "184500000", total_expenditure_inr: "171200000",
        ledger: "fabricated", accounts_fdr_inr: "5000000",
      }, forensic: [], phash: "",
    },
    accounts_clean: {
      checklist_code: "C1", confidence: 0.94, scenario: "",
      label: "Audited accounts, three years, with ledger extract",
      filename: "AuditedAccounts_3yr.pdf",
      fields: {
        ca_firm: "Menon Rao Associates", udin: "26-UDIN-771204",
        financial_years: "2022-23, 2023-24, 2024-25",
        total_income_inr: "132800000", total_expenditure_inr: "124100000",
        ledger: "clean", accounts_fdr_inr: "2500000",
      }, forensic: [], phash: "",
    },
    fdr_certificate: {
      checklist_code: "C3", confidence: 0.95, scenario: isAniket ? "S5" : "",
      label: "FDR / RPGF receipt from the bank file",
      filename: "FDR_Receipt.pdf",
      fields: {
        fdr_number: isAniket ? "FDR-0098234417" : "FDR-0098112250",
        bank_name: isAniket ? "Bank of Maharashtra, Hinjewadi" : "State Bank of India, Indore",
        amount_inr: isAniket ? "5000000" : "2500000",
        maturity_date: isAniket ? "2027-01-15" : "2026-11-30",
      }, forensic: [], phash: "",
    },
    faculty_list: {
      checklist_code: "E1", confidence: 0.94, scenario: isAniket ? "S6" : "",
      label: "CSE faculty list from HR (loads the faculty register)",
      filename: "FacultyList_CSE.xlsx",
      fields: { programme: "CSE", faculty_rows: "attached register" },
      forensic: [], phash: "",
    },
    lab_photo_old: {
      checklist_code: "F7", confidence: 0.88, scenario: "S7",
      label: "Networks lab photograph from last year's folder",
      filename: "NetworksLab.jpg",
      fields: { room: "Networks Lab B-102", photo_date: "2025-02-11" },
      forensic: [], phash: LAB_PHASH_COPY,
    },
    generic_clean: {
      checklist_code: "", confidence: 0.93, scenario: "",
      label: "Complete, signed document for the selected checklist item",
      filename: "document.pdf", fields: {}, forensic: [], phash: "",
    },
    generic_incomplete: {
      checklist_code: "", confidence: 0.72, scenario: "",
      label: "Faint scan, second page missing its date",
      filename: "scan_lowres.pdf", fields: {}, forensic: [], phash: "",
    },
  };
}

export const ROOM_TEMPLATE = [
  // name, claimed L, W, H (m), true L, W — truth is server-side scan replay data
  ["Classroom C-204 (CSE, 60 seats)", 9.1, 6.4, 3.2, 8.2, 6.1],
  ["Networks Lab B-102", 12.0, 8.0, 3.4, 11.8, 7.9],
  ["Tutorial Room T-3", 6.0, 5.0, 3.2, 5.9, 5.05],
  ["Library Reading Hall", 18.0, 10.0, 3.6, 17.6, 10.1],
];

/* ------------------------------ persistence -------------------------------- */

export function insertApplication(s, instId, category, year, status, appDate = "2026-01-15") {
  const appId = s.next.applications++;
  s.applications.push({
    id: appId, institution_id: instId, category, academic_year: year, status,
    application_date: appDate, created_at: now(), submitted_at: status !== "Draft" ? now() : "",
    risk_score: 0, risk_level: "Low", inspection: 0, decision: "", decision_notes: "",
  });
  for (const [name, cl, cw, ch, tl, tw] of ROOM_TEMPLATE) {
    s.rooms.push({
      id: s.next.rooms++, application_id: appId, name,
      claimed_l: cl, claimed_w: cw, claimed_h: ch, true_l: tl, true_w: tw,
      measured_l: null, measured_w: null, measured_h: null,
      scan_status: "Not requested", challenge_code: "", scan_result: "", scanned_at: "",
    });
  }
  return appId;
}

export function insertDoc(s, appId, variant, status = "Accepted") {
  const code = variant.checklist_code;
  const item = checklistByCode(s, code);
  const docId = s.next.documents++;
  s.documents.push({
    id: docId, application_id: appId, checklist_code: code,
    title: item ? item.name : code, filename: variant.filename, status,
    extracted: JSON.stringify({
      fields: variant.fields, confidence: variant.confidence,
      extraction: "OCR + layout extraction on the submitted document",
    }),
    forensic: JSON.stringify(variant.forensic || []),
    phash: variant.phash || "", scenario: variant.scenario || "",
    uploaded_at: now(), verification_status: "", source: "",
  });
  return docId;
}

export function setFaculty(s, appId, rows) {
  s.faculty = s.faculty.filter((f) => f.application_id !== appId);
  for (const r of rows) {
    s.faculty.push({
      id: s.next.faculty++, application_id: appId, name: r.name,
      pan_masked: r.pan_masked, pan_hash: r.pan_hash, designation: r.designation,
      qualification: r.qualification, university: r.university, joining: r.joining,
      department: r.department, salary: r.salary, degree_status: r.degree_status,
      payroll_status: r.payroll_status, epfo_status: r.epfo_status,
	  degree_note: r.degree_note || "",
    });
  }
}

export function setFinancials(s, appId, fabricated, accountsFdr, totalsOk = true, seed = 7) {
  const rng = mulberry32(seed + appId);
  const nums = benfordNumbers(rng, fabricated ? 160 : 150, fabricated);
  const existing = s.financials.find((f) => f.application_id === appId);
  const row = {
    ...(existing || {}),
    application_id: appId, numbers: JSON.stringify(nums),
    accounts_fdr: accountsFdr, totals_ok: totalsOk ? 1 : 0, benford: "",
  };
  if (existing) Object.assign(existing, row);
  else s.financials.push(row);
}

export function storeAfterM1(s, appId, variant, outcome, user) {
  /* Persist an accepted (or forced manual-review) desk upload + side effects. */
  const status = outcome === "Accepted" ? "Accepted" : "Manual review required";
  s.documents = s.documents.filter(
    (d) => !(d.application_id === appId && d.checklist_code === variant.checklist_code)
  );
  const docId = insertDoc(s, appId, variant, status);
  if (variant.checklist_code === "E1") {
    const application = s.applications.find((a) => a.id === appId);
    const inst = instById(s, application.institution_id);
    const has = s.faculty.some((f) => f.application_id === appId);
    if (!has) {
      const profile = inst.key === "Aarav" ? "hero" : "clean";
      setFaculty(s, appId, makeFaculty(mulberry32(42), profile === "hero" ? 31 : 26, profile));
    }
  }
  if (variant.checklist_code === "C1") {
    const fabricated = variant.fields.ledger === "fabricated";
    setFinancials(s, appId, fabricated, parseInt(variant.fields.accounts_fdr_inr, 10), !fabricated, 11);
  }
  audit(s, user.email, "DOCUMENT_UPLOADED", appId, {
    file: variant.filename, checklist: variant.checklist_code, m1: outcome,
  });
  return docId;
}

/* ------------------------- validation orchestrator ------------------------- */

const fmtRs = (n) => Number(n || 0).toLocaleString("en-US");

/* ------------------------- Delta Processing Cache -------------------------- */
/* A verified document whose content hash, expiry and governing rule version
   are all unchanged does not need the source gateway or the forensic pass
   again: the previous verdict is carried forward and the item is reported as
   auto-passed. Anything else is re-checked in full. Nothing is skipped that
   the cache cannot vouch for. */

function deltaGate(s, doc) {
  const ext = jparse(doc.extracted, {});
  const fields = ext.fields || {};
  const hash = E.contentHash({ fields, filename: doc.filename, phash: doc.phash });
  const row = s.delta_cache.find(
    (c) => c.application_id === doc.application_id && c.checklist_code === doc.checklist_code
  );
  const src = jparse(doc.source, {});
  const eff = { ...fields, ...(src.source_fields || {}) };
  const decision = E.deltaDecision({
    cached: row || null,
    currentHash: hash,
    ruleVersion: s.rule_version,
    expiredNow: !!E.validityStatus(eff),
  });
  return { ...decision, hash };
}

function cacheVerifiedDoc(s, doc, hash) {
  if (doc.verification_status !== "Verified") return;
  const row = s.delta_cache.find(
    (c) => c.application_id === doc.application_id && c.checklist_code === doc.checklist_code
  );
  const next = {
    content_hash: hash,
    status: "Verified",
    rule_version: s.rule_version,
    source: doc.source || "",
    verified_at: now(),
  };
  if (row) Object.assign(row, next);
  else s.delta_cache.push({ id: s.next.delta_cache++, application_id: doc.application_id, checklist_code: doc.checklist_code, ...next });
}

/* --------------------------- network evidence ------------------------------ */
/* The campus polling agent reports which machines answered on the college LAN
   on each of three days. Only salted fingerprints leave this function. */

export function networkFor(s, application) {
  const cfg = getConfig(s);
  const inst = instById(s, application.institution_id);
  const rows = s.network_polls.filter((p) => p.application_id === application.id);
  const completed = rows.filter((p) => p.status === "Completed");
  const polls = completed.map((p) => ({
    day: p.day, polled_at: p.polled_at, agent: p.agent, status: p.status,
    devices: jparse(p.devices, []),
  }));
  const analysis = E.analyseNetworkPolls(polls, inst?.declared_systems || 0, cfg);
  const mine = new Set(analysis.fingerprints);
  const overlaps = [];
  for (const other of s.applications) {
    if (other.id === application.id) continue;
    if (other.institution_id === application.institution_id) continue;
    const otherPolls = s.network_polls.filter((p) => p.application_id === other.id && p.status === "Completed");
    if (!otherPolls.length) continue;
    const theirs = new Set(otherPolls.flatMap((p) => jparse(p.devices, [])));
    const shared = E.sharedDevices(mine, theirs);
    if (!shared) continue;
    const jac = E.jaccard(mine, theirs);
    if (jac >= Number(cfg.mac_jaccard_threshold ?? 0.1)) {
      overlaps.push({
        application_id: other.id,
        institution_id: other.institution_id,
        institution: instById(s, other.institution_id)?.name || "",
        institution_city: instById(s, other.institution_id)?.city || "",
        shared_devices: shared,
        jaccard: jac,
        threshold: Number(cfg.mac_jaccard_threshold ?? 0.1),
      });
    }
  }
  const requested = rows.find((p) => p.status === "Requested");
  return {
    application_id: application.id,
    institution: inst?.name || "",
    declared_systems: analysis.declared_systems,
    observed_unique: analysis.observed_unique,
    polling_days: analysis.polling_days,
    per_day: analysis.per_day,
    stable_devices: analysis.stable_devices,
    churn_devices: analysis.churn_devices,
    variance_pct: analysis.variance_pct,
    tolerance_pct: analysis.tolerance_pct,
    below_declared: analysis.below_declared,
    overlap: overlaps,
    request_open: !!requested,
    request: requested ? { day: requested.day, requested_at: requested.polled_at } : null,
    note: analysis.note,
  };
}

/* The campus agent's polling report, submitted from the college side.
   It re-reports the estate already on file — a polling window extends the
   evidence, it does not invent new machines. Only when no window exists yet
   is an estate derived deterministically from the application. */
export function submitPollWindow(s, application, actor) {
  const inst = instById(s, application.institution_id);
  const declared = inst?.declared_systems || 0;
  const completed = s.network_polls.filter((x) => x.application_id === application.id && x.status === "Completed");
  const estate = new Set();
  for (const p of completed) for (const d of jparse(p.devices, [])) estate.add(d);

  let devices;
  if (estate.size) {
    devices = [...estate].filter((_, i) => i % 97 !== 0); // a couple switched off that morning
  } else {
    const base = Math.max(1, Math.round(declared * 0.98));
    devices = [];
    for (let i = 0; i < base; i++) devices.push(E.deviceFingerprint(E.deviceMac(100 + application.id, i + 1)));
  }

  const last = completed.reduce((m, p) => (p.day > m ? p.day : m), now().slice(0, 10));
  const next = new Date(`${last}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const day = next.toISOString().slice(0, 10);

  s.network_polls = s.network_polls.filter((x) => !(x.application_id === application.id && x.status === "Requested"));
  const row = {
    id: s.next.network_polls++,
    application_id: application.id,
    day,
    polled_at: now(),
    agent: `campus polling agent v1.2 (submitted by ${actor})`,
    status: "Completed",
    devices: JSON.stringify([...new Set(devices)]),
  };
  s.network_polls.push(row);
  audit(s, actor, "NETWORK_POLL_SUBMITTED", application.id, {
    day: row.day, observed: new Set(devices).size, declared,
    note: "Salted device fingerprints only; no hardware address stored.",
  });
  return row;
}

export function runValidation(s, appId, actor) {
  const cfg = getConfig(s);
  const application = s.applications.find((a) => a.id === appId);
  const inst = instById(s, application.institution_id);
  const registry = registryMap(s);
  const checklist = new Map(s.checklist.map((c) => [c.code, c]));
  const deepCodes = s.checklist.filter((c) => c.deep).map((c) => c.code).sort();
  const docs = s.documents.filter((d) => d.application_id === appId);
  let newFlags = 0;
  let autoPassed = 0;
  const deltaCounts = { modified: 0, new: 0, rechecked: 0 };
  const criticalFields = new Set(["expiry_date", "grade", "cgpa", "amount_inr"]);

  for (const doc of docs) {
    const item = checklist.get(doc.checklist_code) || {};
    const ext = jparse(doc.extracted, {});
    const fields = ext.fields || {};
    const gate = deltaGate(s, doc);
    doc.delta_status = gate.status;
    doc.content_hash = gate.hash;
    if (gate.autoPass) {
      // carried forward: content, expiry and rule version all unchanged
      doc.verification_status = "Verified";
      autoPassed++;
      continue;
    }
    if (gate.status === "Modified — re-verified") deltaCounts.modified++;
    else if (gate.status === "New this cycle") deltaCounts.new++;
    else deltaCounts.rechecked++;
    // M3 — source comparison
    const m3 = E.m3Compare(item.connector || "None", fields, registry, cfg.connectors);
    // Type A validity: trust the source date when a source record exists
    const effFields = { ...fields };
    if (m3.source_fields && Object.keys(m3.source_fields).length) {
      for (const k of ["expiry_date", "valid_until"]) {
        if (m3.source_fields[k]) effFields[k] = m3.source_fields[k];
      }
    }
    const expired = E.validityStatus(effFields);
    let status = expired && ["Verified", "Mismatch detected"].includes(m3.status) ? "Expired" : m3.status;
    if (expired && m3.status === "Verified") status = "Expired";
    else if (m3.status === "Mismatch detected") status = "Mismatch detected";
    doc.verification_status = status;
    doc.source = JSON.stringify(m3);
    if (m3.status === "Mismatch detected") {
      const bad = m3.field_results.filter((fr) => fr.result === "Mismatch");
      const sev = bad.some((fr) => criticalFields.has(fr.field)) ? "High" : "Medium";
      const detail = bad
        .map((fr) => `${fr.field.replaceAll("_", " ")}: submitted ${fr.submitted}, source holds ${fr.source}`)
        .join("; ");
      newFlags += addFlag(
        s, appId, doc.id, `M3-${doc.id}`, "M3", sev,
        `${item.name || doc.checklist_code} does not match the issuing-authority record — ${detail}`,
        { source: m3.source, mode: m3.mode, field_results: m3.field_results }, 0.98
      ) ? 1 : 0;
    }
    if (expired) {
      const expVal = effFields.expiry_date || effFields.valid_until;
      newFlags += addFlag(
        s, appId, doc.id, `EXP-${doc.id}`, "M3", "Medium",
        `${item.name || doc.checklist_code} validity ended ${expVal} per the source record; a renewed certificate is needed`,
        { expiry: expVal, source: m3.source }, 0.97
      ) ? 1 : 0;
      alert(s, appId, "Expired document", `Expired: ${item.name || doc.checklist_code} (${expVal})`, "both");
    }
    if (["Verification pending", "Source unavailable"].includes(m3.status)) {
      alert(s, appId, "Pending source verification", `${item.name || doc.checklist_code}: ${m3.status} — ${m3.source}`, "officer");
    }
    // M4 — forensic signals (multi-signal rule inside engines)
    const signals = jparse(doc.forensic, []);
    const sev4 = E.forensicSeverity(signals);
    if (sev4) {
      newFlags += addFlag(
        s, appId, doc.id, `M4-${doc.id}`, "M4", sev4,
        `${item.name || doc.checklist_code} shows ${signals.length} editing indicator(s); treat as an indicator for human verification, not proof of editing`,
        { signals, rule: "High needs two independent signals" }, 0.81
      ) ? 1 : 0;
    }
    // M4 — pHash duplicates across applications
    if (doc.phash) {
      const others = s.documents.filter(
        (o) => o.phash && o.id !== doc.id && o.application_id !== appId
      );
      for (const o of others) {
        const dist = E.Hamming(doc.phash, o.phash);
        // The earlier filing is the original; only the later copy is reuse.
        if (dist <= cfg.phash_distance && (doc.uploaded_at || "") >= (o.uploaded_at || "")) {
          const otherApp = s.applications.find((a) => a.id === o.application_id);
          const otherInst = instById(s, otherApp.institution_id)?.name || "";
          newFlags += addFlag(
            s, appId, doc.id, `PHASH-${doc.id}-${o.id}`, "M4", "Medium",
            `Image in ${item.name || doc.checklist_code} is a near-duplicate of an image filed by ${otherInst} (pHash Hamming distance ${dist} of 64, CONFIG limit ${cfg.phash_distance}) — survives resize and recompression`,
            { hamming: dist, other_application_id: o.application_id, other_institution: otherInst, other_document_id: o.id }, 0.9
          ) ? 1 : 0;
        }
      }
    }
    cacheVerifiedDoc(s, doc, gate.hash);
  }

  // Missing mandatory items from the deep slice — only once an application is
  // a real filing (5+ documents); an empty shell is not 13 offences.
  if (application.status !== "Draft" && docs.length >= 5) {
    const have = new Set(docs.filter((d) => d.status !== "Returned for fix").map((d) => d.checklist_code));
    for (const code of deepCodes) {
      const it = checklist.get(code);
      if (it && it.mandatory && !have.has(code)) {
        newFlags += addFlag(
          s, appId, null, `MISS-${code}`, "M1", it.severity,
          `Mandatory document not filed: ${it.name} (${code})`,
          { checklist_code: code, clause: it.clause }, 0.99
        ) ? 1 : 0;
        alert(s, appId, "Missing information", `Missing mandatory document: ${it.name}`, "both");
      }
    }
  }

  // M5 — financial checks
  const fin = s.financials.find((f) => f.application_id === appId);
  if (fin) {
    const ben = E.benford(jparse(fin.numbers, []), cfg.benford_min_n, cfg.benford_mad_limit);
    fin.benford = JSON.stringify(ben);
    if (ben.status === "Non-conformity") {
      newFlags += addFlag(
        s, appId, null, "M5-BENFORD", "M5", "Medium",
        `Ledger first digits do not conform to Benford's Law (MAD ${ben.MAD} against limit ${cfg.benford_mad_limit}, n=${ben.n}) — anomaly requiring audit review`,
        { benford: ben }, 0.74
      ) ? 1 : 0;
    }
    if (!fin.totals_ok) {
      newFlags += addFlag(
        s, appId, null, "M5-TOTALS", "M5", "Medium",
        "Audited accounts: a schedule subtotal does not add to its stated total",
        { check: "Arithmetic integrity" }, 0.95
      ) ? 1 : 0;
    }
    const fdrDoc = docs.find((d) => d.checklist_code === "C3") || null;
    let bankAmt = null;
    let rpgfAmt = null;
    if (fdrDoc) {
      const ff = jparse(fdrDoc.extracted, {}).fields || {};
      const src = registry.get(`Bank ${ff.fdr_number}`) || {};
      bankAmt = src.amount_inr ? parseInt(src.amount_inr, 10) : null;
      rpgfAmt = ff.amount_inr ? parseInt(ff.amount_inr, 10) : null;
    }
    const rec = E.reconcileFdr(bankAmt, fin.accounts_fdr, rpgfAmt);
    if (bankAmt && !rec.agree) {
      newFlags += addFlag(
        s, appId, fdrDoc ? fdrDoc.id : null, "M5-RECON", "M5", "Medium",
        `FDR amount disagrees across documents: bank record Rs ${fmtRs(bankAmt)}, audited accounts Rs ${fmtRs(fin.accounts_fdr)}, application RPGF figure Rs ${fmtRs(rpgfAmt || 0)}`,
        { reconciliation: rec }, 0.96
      ) ? 1 : 0;
    }
  }

  // M6 — faculty compliance
  const fac = s.faculty.filter((f) => f.application_id === appId).map((f) => ({ ...f }));
  const intake = jparse(inst.intake, {});
  const studentsCse = parseInt(intake.CSE || 0, 10) * 4;
  if (fac.length && studentsCse) {
    const comp = E.facultyCompliance(fac, studentsCse, cfg, application.application_date);
    for (const r of comp.rows) {
      if (r.degree_status === "Mismatch detected") {
        newFlags += addFlag(
          s, appId, null, `M6-DEG-${r.pan_hash}`, "M6", "High",
          `${r.name} (${r.designation}): claimed ${r.qualification} from ${r.university} has no matching record in DigiLocker / ABC-NAD`,
          { faculty: r.name, pan_masked: r.pan_masked }, 0.9
        ) ? 1 : 0;
      }
      const dummy = r.issues.filter((i) => i.includes("dummy-teacher pattern") || i.includes("Absent from"));
      if (dummy.length) {
        newFlags += addFlag(
          s, appId, null, `M6-DUM-${r.pan_hash}`, "M6", "Medium",
          `${r.name} (${r.designation}): ` + r.issues.join("; "),
          { faculty: r.name, pan_masked: r.pan_masked, issues: r.issues }, 0.83
        ) ? 1 : 0;
      }
    }
    if (comp.shortfall > 0) {
      newFlags += addFlag(
        s, appId, null, "M6-SFR", "M6", "Medium",
        `CSE verified faculty ${comp.verified} against ${comp.required} required at SFR 1:${cfg.sfr_target} for ${studentsCse} students (declared ${comp.declared}); shortfall ${comp.shortfall}`,
        {
          compliance: {
            students: comp.students, declared: comp.declared, verified: comp.verified,
            required: comp.required, shortfall: comp.shortfall, sfr_verified: comp.sfr_verified,
          },
        }, 0.99
      ) ? 1 : 0;
    }
    // M7 — same person full-time at another college
    const myHashes = new Map(fac.map((r) => [r.pan_hash, r]));
    const seen = new Set();
    for (const o of s.faculty) {
      if (o.application_id === appId) continue;
      if (myHashes.has(o.pan_hash) && !seen.has(o.pan_hash)) {
        seen.add(o.pan_hash);
        const otherApp = s.applications.find((a) => a.id === o.application_id);
        if (otherApp && otherApp.institution_id !== application.institution_id) {
          const oi = instById(s, otherApp.institution_id)?.name || "";
          newFlags += addFlag(
            s, appId, null, `M7-FAC-${o.pan_hash}`, "M7", "High",
            `${myHashes.get(o.pan_hash).name} (PAN ${o.pan_masked}) is also filed as full-time faculty by ${oi}; one person, two colleges, overlapping period`,
            { other_institution: oi, other_application_id: o.application_id, pan_masked: o.pan_masked }, 0.97
          ) ? 1 : 0;
        }
      }
    }
  }

  // M7 — same land parcel in two colleges' applications
  for (const doc of docs) {
    if (doc.checklist_code === "B1") {
      const reg = (jparse(doc.extracted, {}).fields || {}).registration_number;
      if (reg) {
        const others = s.documents.filter((o) => o.checklist_code === "B1" && o.application_id !== appId);
        for (const o of others) {
          const oreg = (jparse(o.extracted, {}).fields || {}).registration_number;
          const otherApp = s.applications.find((a) => a.id === o.application_id);
          if (oreg === reg && otherApp && otherApp.institution_id !== application.institution_id) {
            const oi = instById(s, otherApp.institution_id)?.name || "";
            newFlags += addFlag(
              s, appId, doc.id, `M7-LAND-${reg}-${o.application_id}`, "M7", "High",
              `Land deed ${reg} is also filed by ${oi}; the same parcel cannot house two campuses`,
              { other_institution: oi, other_application_id: o.application_id, registration_number: reg }, 0.97
            ) ? 1 : 0;
          }
        }
      }
    }
  }

  // Network evidence (MAC / device fingerprinting)
  const net = networkFor(s, application);
  if (net.polling_days > 0) {
    if (net.below_declared) {
      newFlags += addFlag(
        s, appId, null, "MAC-COUNT", "MAC", "Medium",
        `Declared ${net.declared_systems} computer systems, but the campus network answered for only ${net.observed_unique} distinct machines across ${net.polling_days} polling days (${net.variance_pct}% against a ${net.tolerance_pct}% tolerance) — the declared laboratory estate is not fully present`,
        {
          network: {
            declared_systems: net.declared_systems, observed_unique: net.observed_unique,
            variance_pct: net.variance_pct, tolerance_pct: net.tolerance_pct,
            per_day: net.per_day, stable_devices: net.stable_devices, churn_devices: net.churn_devices,
          },
          method: "Salted device fingerprints from the campus polling agent; no hardware address is stored.",
        }, 0.9
      ) ? 1 : 0;
    }
    for (const ov of net.overlap) {
      newFlags += addFlag(
        s, appId, null, `MAC-OVERLAP-${ov.application_id}`, "MAC", "Medium",
        `${ov.shared_devices} devices answer on both this campus network and ${ov.institution}'s (Jaccard overlap ${ov.jaccard} against a ${ov.threshold} threshold) — the same physical machines are being counted by two colleges`,
        {
          network: {
            other_application_id: ov.application_id, other_institution: ov.institution,
            shared_devices: ov.shared_devices, jaccard: ov.jaccard, threshold: ov.threshold,
          },
          method: "Salted device fingerprints, equal only when the hardware address is equal.",
        }, 0.93
      ) ? 1 : 0;
    }
  }

  // Delta Processing Cache summary for this run
  const delta = {
    auto_passed: autoPassed,
    modified: deltaCounts.modified,
    new_this_cycle: deltaCounts.new,
    rechecked: deltaCounts.rechecked,
    total: docs.length,
    rule_version: s.rule_version,
  };

  // Risk score from open flags (CONFIG weights)
  const flags = s.flags.filter((f) => f.application_id === appId);
  const [score, level, inspection] = E.riskFromFlags(flags, cfg);
  application.risk_score = score;
  application.risk_level = level;
  application.inspection = inspection ? 1 : 0;
  audit(s, actor, "VALIDATION_RUN", appId, {
    new_flags: newFlags,
    open_flags: flags.filter((f) => f.status === "Open").length,
    risk_score: score,
    risk_level: level,
    modules: ["M1", "M3", "M4", "M5", "M6", "M7", "MAC"],
    delta,
    rule_version: s.rule_version,
  });
  return {
    new_flags: newFlags, risk_score: score, risk_level: level,
    inspection_recommended: inspection, delta,
    rule_version: s.rule_version,
  };
}

/* ------------------------------- trust graph ------------------------------- */

export function graphFor(s, application) {
  const cfg = getConfig(s);
  const appId = application.id;
  const me = instById(s, application.institution_id);
  const nodes = [
    { id: `inst-${me.id}`, label: me.name, kind: "college", self: true },
    { id: `trust-${me.trust}`, label: `Trust: ${me.trust}`, kind: "trust" },
  ];
  const edges = [{ a: `inst-${me.id}`, b: `trust-${me.trust}`, label: "run by", alert: false }];
  const seenNodes = new Set(nodes.map((n) => n.id));
  const addNode = (nid, label, kind) => {
    if (!seenNodes.has(nid)) {
      nodes.push({ id: nid, label, kind });
      seenNodes.add(nid);
    }
  };
  const otherInstNode = (instId) => {
    const o = instById(s, instId);
    addNode(`inst-${o.id}`, o.name, "college");
    return o;
  };

  const myFac = s.faculty.filter((f) => f.application_id === appId);
  const myHashes = new Map(myFac.map((f) => [f.pan_hash, f]));
  for (const o of s.faculty) {
    if (o.application_id === appId) continue;
    const otherApp = s.applications.find((a) => a.id === o.application_id);
    if (myHashes.has(o.pan_hash) && otherApp && otherApp.institution_id !== application.institution_id) {
      const p = `person-${o.pan_hash}`;
      addNode(p, `${o.name} · PAN ${o.pan_masked}`, "person");
      otherInstNode(otherApp.institution_id);
      edges.push({ a: `inst-${me.id}`, b: p, label: "employs (full-time)", alert: true, application_id: appId });
      edges.push({ a: p, b: `inst-${otherApp.institution_id}`, label: "also employs (full-time)", alert: true, application_id: o.application_id });
    }
  }
  const myDocs = s.documents.filter((d) => d.application_id === appId);
  for (const doc of myDocs) {
    const fields = jparse(doc.extracted, {}).fields || {};
    if (doc.checklist_code === "B1" && fields.registration_number) {
      const land = `land-${fields.registration_number}`;
      addNode(land, `Land deed ${fields.registration_number}`, "land");
      edges.push({ a: `inst-${me.id}`, b: land, label: "campus on", alert: false, document_id: doc.id });
      for (const o of s.documents) {
        if (o.checklist_code !== "B1" || o.application_id === appId) continue;
        const otherApp = s.applications.find((a) => a.id === o.application_id);
        if (
          (jparse(o.extracted, {}).fields || {}).registration_number === fields.registration_number &&
          otherApp && otherApp.institution_id !== application.institution_id
        ) {
          otherInstNode(otherApp.institution_id);
          edges.push({
            a: land, b: `inst-${otherApp.institution_id}`, label: "same parcel filed by",
            alert: true, application_id: o.application_id, document_id: o.id,
          });
        }
      }
    }
    if (doc.phash) {
      for (const o of s.documents) {
        if (!o.phash || o.application_id === appId) continue;
        const otherApp = s.applications.find((a) => a.id === o.application_id);
        const dist = E.Hamming(doc.phash, o.phash);
        if (dist <= cfg.phash_distance && otherApp && otherApp.institution_id !== application.institution_id) {
          const img = `img-${doc.id}-${o.id}`;
          addNode(img, `Lab image (pHash distance ${dist})`, "image");
          otherInstNode(otherApp.institution_id);
          edges.push({ a: `inst-${me.id}`, b: img, label: "filed photo", alert: true, document_id: doc.id });
          edges.push({
            a: img, b: `inst-${otherApp.institution_id}`, label: "near-identical photo filed by",
            alert: true, application_id: o.application_id, document_id: o.id,
          });
        }
      }
    }
  }
  // shared device fingerprints: the same physical machines on two campuses
  const net = networkFor(s, application);
  for (const ov of net.overlap) {
    const dev = `dev-${application.id}-${ov.application_id}`;
    addNode(dev, `${ov.shared_devices} shared devices · Jaccard ${ov.jaccard}`, "devices");
    otherInstNode(ov.institution_id);
    edges.push({ a: `inst-${me.id}`, b: dev, label: "network answers on", alert: true, application_id: appId });
    edges.push({ a: dev, b: `inst-${ov.institution_id}`, label: "same machines seen at", alert: true, application_id: ov.application_id });
  }

  // trusts running several colleges are context, not an offence
  for (const o of s.institutions) {
    if (o.trust === me.trust && o.id !== me.id) {
      addNode(`inst-${o.id}`, o.name, "college");
      edges.push({ a: `trust-${me.trust}`, b: `inst-${o.id}`, label: "also runs", alert: false });
    }
  }
  return {
    nodes, edges,
    note: "Shared-trust links are context. Red links are reuse that a single-document check cannot see.",
  };
}
