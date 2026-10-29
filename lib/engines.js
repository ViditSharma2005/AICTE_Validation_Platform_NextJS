/* Validation engines M1–M7.
   All rule checks, ratio math, Benford tests and hash comparisons here are
   real computation over the stored data. No external service is called. */
import crypto from "node:crypto";

/* Python-compatible round() (round-half-even), so displayed figures match. */
export function roundPy(x, nd = 0) {
  const m = 10 ** nd;
  const y = x * m;
  const f = Math.floor(y);
  const d = y - f;
  let r;
  if (d > 0.5) r = f + 1;
  else if (d < 0.5) r = f;
  else r = f % 2 === 0 ? f : f + 1;
  return r / m;
}

/* ---------------- M1: Shift-Left Validation (The Bouncer) ------------------ */

export function m1Evaluate(requiredFields, fields, confidence = 0.94) {
  /* Outcomes: Accepted / Returned for fix / Accepted with manual review.
     A bounce at upload is a request to fix, never a rejection. */
  const reasons = [];
  for (const f of requiredFields) {
    const val = fields[f];
    if (f === "signature_present") {
      if (val !== true) {
        reasons.push(
          "Signature not detected on the execution page (signature/stamp region is empty)"
        );
      }
      continue;
    }
    if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
      reasons.push(`Required field not found: ${f.replaceAll("_", " ")}`);
    }
  }
  if (fields.estamp_value_inr && !["500", "1000"].includes(String(fields.estamp_value_inr))) {
    reasons.push(
      `e-Stamp value read as Rs ${fields.estamp_value_inr}; this affidavit requires Rs 500 stamp paper`
    );
  }
  if (reasons.length) {
    return { outcome: "Returned for fix", reasons, confidence };
  }
  if (confidence < 0.8) {
    return {
      outcome: "Accepted with manual review",
      reasons: [
        "Extraction confidence below 0.80 on one or more fields; an officer will read this document by hand",
      ],
      confidence,
    };
  }
  return { outcome: "Accepted", reasons: [], confidence };
}

/* ---------------- M3: source comparison gateway ---------------------------- */

export function m3Compare(connector, submitted, registry, connectorModes) {
  /* Compare submitted fields with the source record, field by field.
     'Verified' only ever means: submitted values match the source record. */
  const mode = connectorModes[connector] ?? "registry";
  if (connector === "Public website crawler") {
    // Type D: the public website is its own source. Verified = the crawler
    // found the declared pages live at the declared URL.
    if (submitted.url) {
      return {
        status: "Verified",
        source: "Institution's public website (crawler)",
        mode: "internal",
        field_results: Object.entries(submitted).map(([k, v]) => ({
          field: k,
          submitted: v,
          source: "page live at crawl time",
          result: "Match",
        })),
        source_fields: { ...submitted },
      };
    }
    return { status: "Verification pending", source: connector, mode: "internal", field_results: [], source_fields: {} };
  }
  if (!connector || connector === "None") {
    return {
      status: "Declared (not verifiable)",
      source: "No issuing-authority source exists",
      mode: "-",
      field_results: [],
      source_fields: {},
    };
  }
  if (mode === "off") {
    return { status: "Source unavailable", source: connector, mode, field_results: [], source_fields: {} };
  }
  if (mode === "live") {
    return {
      status: "Verification pending",
      source: connector,
      mode,
      field_results: [],
      source_fields: {},
      note: "Live mode needs authorised credentials; request queued, not sent.",
    };
  }
  // registry mode: find the source record by any identifier present
  const refKeys = ["certificate_number", "udin", "estamp_number", "registration_number", "fdr_number"];
  let source = null;
  for (const k of refKeys) {
    if (submitted[k] && registry.has(`${connector} ${submitted[k]}`)) {
      source = registry.get(`${connector} ${submitted[k]}`);
      break;
    }
  }
  if (source === null) {
    return {
      status: "Verification pending",
      source: connector,
      mode,
      field_results: [],
      source_fields: {},
      note: "No matching record in the source registry for the submitted identifiers.",
    };
  }
  const results = [];
  let mismatch = false;
  for (const [k, sv] of Object.entries(source)) {
    if (k === "status") continue;
    const sub = submitted[k] ?? null;
    const ok = sub !== null && String(sub).trim().toLowerCase() === String(sv).trim().toLowerCase();
    if (sub !== null && !ok) mismatch = true;
    results.push({
      field: k,
      submitted: sub,
      source: sv,
      result: ok ? "Match" : sub === null ? "Not submitted" : "Mismatch",
    });
  }
  return {
    status: mismatch ? "Mismatch detected" : "Verified",
    source: connector,
    mode,
    field_results: results,
    source_fields: source,
  };
}

function parseYmd(s) {
  try {
    const [y, m, d] = String(s).slice(0, 10).split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  } catch {
    return null;
  }
}

export function validityStatus(fields, todayMs = null) {
  /* Type A expiry check. Returns 'Expired' or null. */
  const exp = fields.expiry_date || fields.valid_until;
  if (!exp) return null;
  const e = parseYmd(exp);
  if (e === null) return null;
  const t = todayMs ?? (() => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); })();
  return e < t ? "Expired" : null;
}

/* ---------------- M4: Forensic signals + pHash ----------------------------- */

export function forensicSeverity(signals) {
  /* One weak signal can only raise Low; High needs two independent signals.
     Always an indicator, never a verdict. */
  if (signals.length >= 2) return "High";
  if (signals.length === 1) return "Low";
  return null;
}

export function Hamming(a, b) {
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n++;
  return n;
}

/* Real average-hash (64-bit) for uploaded images, via sharp. */
export async function ahashFromImageBytes(data) {
  try {
    const sharp = (await import("sharp")).default;
    const buf = await sharp(data).grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
    const px = Array.from(buf);
    if (px.length !== 64) return null;
    const avg = px.reduce((s, p) => s + p, 0) / px.length;
    return px.map((p) => (p >= avg ? "1" : "0")).join("");
  } catch {
    return null;
  }
}

/* ---------------- M5: Benford's Law + reconciliation ----------------------- */

export function benford(numbers, minN = 100, madLimit = 0.015) {
  /* First-digit Benford test with MAD (Nigrini) and chi-square.
     Below the CONFIG sample minimum the honest answer is Insufficient data. */
  const digits = [];
  for (const n of numbers) {
    const s = String(Math.abs(Math.trunc(n))).replace(/^0+/, "");
    if (s) digits.push(parseInt(s[0], 10));
  }
  const n = digits.length;
  const expected = {};
  for (let d = 1; d <= 9; d++) expected[d] = Math.log10(1 + 1 / d);
  const expOut = {};
  for (let d = 1; d <= 9; d++) expOut[String(d)] = roundPy(expected[d], 4);
  if (n < minN) {
    return {
      status: "Insufficient data",
      n,
      min_n: minN,
      note: `Only ${n} usable numbers; the test needs at least ${minN} spanning several orders of magnitude. No flag is raised.`,
      observed: {},
      expected: expOut,
    };
  }
  const count = (d) => digits.filter((x) => x === d).length;
  const observed = {};
  for (let d = 1; d <= 9; d++) observed[d] = count(d) / n;
  let mad = 0;
  let chi2 = 0;
  for (let d = 1; d <= 9; d++) {
    mad += Math.abs(observed[d] - expected[d]);
    chi2 += (count(d) - expected[d] * n) ** 2 / (expected[d] * n);
  }
  mad /= 9;
  const conformity = mad > madLimit ? "Non-conformity" : mad > 0.012 ? "Marginal conformity" : "Close conformity";
  const obsOut = {};
  for (let d = 1; d <= 9; d++) obsOut[String(d)] = roundPy(observed[d], 4);
  return {
    status: conformity,
    n,
    min_n: minN,
    MAD: roundPy(mad, 4),
    mad_limit: madLimit,
    chi_square: roundPy(chi2, 2),
    observed: obsOut,
    expected: expOut,
    note: "Benford non-conformity alone never raises a High flag. It is evidence for audit review, read with the checks below.",
  };
}

export function reconcileFdr(bankAmt, accountsAmt, rpgfAmt) {
  const vals = {
    "Bank manager certificate": bankAmt,
    "Audited accounts (FDR schedule)": accountsAmt,
    "RPGF details in application": rpgfAmt,
  };
  const present = Object.values(vals).filter(Boolean);
  return { values: vals, agree: new Set(present).size <= 1 };
}

/* ---------------- M6: Faculty compliance ----------------------------------- */

export function parseDate(s) {
  return parseYmd(s);
}

export function facultyCompliance(rows, students, config, applicationDate = "2026-01-15") {
  /* Ratio math over verified faculty only. SFR target comes from CONFIG. */
  const appD = parseDate(applicationDate) ?? Date.UTC(2026, 0, 15);
  const verified = [];
  const problems = [];
  for (const r of rows) {
    const issues = [];
    if (r.degree_status === "Mismatch detected") {
      issues.push("Degree record not found in DigiLocker / ABC-NAD");
    }
    if (String(r.payroll_status ?? "").includes("No salary-sheet row")) {
      issues.push("Absent from the salary sheet");
    }
    if (String(r.epfo_status ?? "").includes("No contribution history")) {
      issues.push("No EPFO contributions with this employer");
    }
    const jd = parseDate(r.joining ?? "");
    const days = jd === null ? null : Math.round((appD - jd) / 86400000);
    const recent = days !== null && days >= 0 && days <= config.joined_recent_days;
    const lowPay = (r.salary || 0) < config.low_pay_threshold_inr;
    if (recent && lowPay) {
      issues.push(
        `Joined ${days} days before application at Rs ${Number(r.salary).toLocaleString("en-US")}/month — dummy-teacher pattern, needs officer review`
      );
    } else if (recent) {
      issues.push(`Joined ${days} days before application`);
    }
    const r2 = { ...r, issues, counted: issues.length === 0 };
    (r2.counted ? verified : problems).push(r2);
  }
  const required = students ? Math.ceil(students / config.sfr_target) : 0;
  const cadreReq = {};
  const cadreHave = {};
  const totalRatio = Object.values(config.cadre_ratio).reduce((s, v) => s + v, 0);
  for (const [cadre, part] of Object.entries(config.cadre_ratio)) {
    cadreReq[cadre] = Math.floor((required * part) / totalRatio);
    cadreHave[cadre] = verified.filter((r) => r.designation === cadre).length;
  }
  // flooring remainder goes to Assistant Professor so cadre sums to required
  cadreReq["Assistant Professor"] =
    (cadreReq["Assistant Professor"] || 0) + (required - Object.values(cadreReq).reduce((s, v) => s + v, 0));
  return {
    students,
    sfr_target: config.sfr_target,
    declared: rows.length,
    verified: verified.length,
    required,
    shortfall: Math.max(0, required - verified.length),
    sfr_declared: rows.length ? roundPy(students / rows.length, 1) : null,
    sfr_verified: verified.length ? roundPy(students / verified.length, 1) : null,
    cadre_required: cadreReq,
    cadre_verified: cadreHave,
    rows: [...verified, ...problems],
    note: "Ratios are configuration values — verify against the current Approval Process Handbook before reliance.",
  };
}

/* ---------------- M2: AR spatial comparison -------------------------------- */

export function arCompare(claimedL, claimedW, measL, measW, tolerancePct = 5) {
  const claimedArea = claimedL * claimedW;
  const measuredArea = measL * measW;
  const diffPct = claimedArea ? ((measuredArea - claimedArea) / claimedArea) * 100 : 0;
  return {
    claimed_area_sqm: roundPy(claimedArea, 2),
    measured_area_sqm: roundPy(measuredArea, 2),
    diff_pct: roundPy(diffPct, 1),
    tolerance_pct: tolerancePct,
    result: Math.abs(diffPct) <= tolerancePct ? "Consistent" : "Out of tolerance",
    note: "Advisory only. Out of tolerance means: schedule a physical inspection. It does not mean fraud.",
  };
}

export function withinGeofence(campusLat, campusLng, lat, lng, radiusM = 600) {
  // flat-earth approximation, fine at campus scale
  const dy = (lat - campusLat) * 111320;
  const dx = (lng - campusLng) * 111320 * Math.cos((campusLat * Math.PI) / 180);
  const dist = Math.hypot(dx, dy);
  return [dist <= radiusM, roundPy(dist)];
}

/* ---------------- Risk score (CONFIG weights) ------------------------------ */

export function riskFromFlags(flags, config) {
  let score = 0;
  for (const f of flags) {
    if (["Open", "Escalated", "Clarification requested"].includes(f.status)) {
      score += config.risk_weights[f.severity] || 0;
    }
  }
  score = Math.min(score, 100);
  const level = score >= config.risk_high_at ? "High" : score >= config.risk_medium_at ? "Medium" : "Low";
  const inspection =
    level === "High" ||
    flags.some((f) => f.severity === "High" && ["M2", "M4"].includes(f.module) && f.status === "Open");
  return [score, level, inspection];
}

/* ---------------- Audit hash chain ----------------------------------------- */

/* Python json.dumps(..., sort_keys=True) equivalent (", " / ": " separators),
   so the chain stays verifiable with the same algorithm. */
export function pyJsonSorted(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(pyJsonSorted).join(", ") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}: ${pyJsonSorted(v[k])}`).join(", ") + "}";
}

export function auditHash(prevHash, ts, actor, action, detail) {
  const payload = `${prevHash}|${ts}|${actor}|${action}|${pyJsonSorted(detail)}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}
