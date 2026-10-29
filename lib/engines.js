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

/* Geometry sanity check for a camera room scan. The browser does the
   perspective rectification; the server will not accept a payload whose four
   marks could not be the floor corners of a rectangle, or whose measured
   sides ignore the calibration edge the person actually tape-measured. */
export function validateCameraGeometry(bd) {
  const problems = [];
  const corners = (Array.isArray(bd.corners) ? bd.corners : []).map((c) => ({
    x: Number(c && c.x), y: Number(c && c.y),
  }));
  if (corners.length !== 4 || corners.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) {
    return ["four numeric floor corners are required"];
  }
  const frameW = Number(bd.frame_w || (bd.frame && bd.frame.w) || 0);
  const frameH = Number(bd.frame_h || (bd.frame && bd.frame.h) || 0);
  // corners arrive in video pixels from the browser; normalised 0..1 is also
  // accepted so the same rule works for a different capture front end.
  const biggest = Math.max(...corners.map((c) => Math.max(Math.abs(c.x), Math.abs(c.y))));
  const normalised = biggest <= 1.5;
  const scaleX = normalised ? (frameW > 0 ? frameW : 1) : 1;
  const scaleY = normalised ? (frameH > 0 ? frameH : 1) : 1;
  const px = corners.map((c) => ({ x: c.x * scaleX, y: c.y * scaleY }));

  // shoelace area: a real floor quad covers a meaningful part of the frame
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const a = px[i], b = px[(i + 1) % 4];
    area2 += a.x * b.y - b.x * a.y;
  }
  const area = Math.abs(area2) / 2;
  const frameArea = normalised ? scaleX * scaleY : frameW > 0 && frameH > 0 ? frameW * frameH : 0;
  if (frameArea > 0) {
    if (area < frameArea * 0.01) problems.push("the four marks cover too little of the frame to measure a room");
    if (area > frameArea * 0.98) problems.push("the four marks cannot cover the whole frame");
  }

  // a rectangle seen in perspective stays convex and keeps its winding order
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = px[i], b = px[(i + 1) % 4], c = px[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) { problems.push("two of the marks sit on the same line"); break; }
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) { problems.push("the four marks are not in order around the room"); break; }
  }

  // the calibration edge is corner 1 to corner 2: one measured side must be it
  const calib = Number(bd.calibration_edge_m);
  const sides = [Number(bd.measured_l), Number(bd.measured_w)].filter((v) => v > 0);
  if (calib > 0.1 && sides.length) {
    const closest = sides.reduce((m, v) => Math.min(m, Math.abs(v - calib) / calib), Infinity);
    if (closest > 0.02) {
      problems.push("the calibration edge must be one side of the measured rectangle");
    }
  }
  return problems;
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

/* ============================================================================
   V2 — Delta Processing Cache and network fingerprinting primitives.
   Every function here is deterministic and computes over stored data only.
   ========================================================================== */

/* python json.dumps(sort_keys=True) equivalent, used as a stable serialiser so
   the same document always hashes to the same value regardless of key order. */
export function stableJson(v) {
  return pyJsonSorted(v);
}

/* Content hash of a filed document: extracted fields + filename + pHash.
   Filename alone is not enough (a renamed PDF is still the same content);
   fields alone are not enough (a re-scan changes the frame, not the values). */
export function contentHash({ fields, filename, phash }) {
  const payload = stableJson({
    filename: String(filename || ""),
    fields: fields || {},
    phash: String(phash || ""),
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/* ---------------------- network fingerprinting ---------------------------- */

/* The MAC address itself never leaves this function. We keep a salted
   SHA-256 of the normalised MAC, so the same physical device produces the
   same fingerprint at every institution (which is what makes cross-college
   overlap detectable) while the raw hardware address is never stored or
   displayed anywhere. */
const NET_PEPPER = () => process.env.NET_FINGERPRINT_PEPPER || "portal-net-pepper-v1";

export function normaliseMac(mac) {
  return String(mac || "").toLowerCase().replace(/[^0-9a-f]/g, "").padEnd(12, "0").slice(0, 12);
}

export function deviceFingerprint(mac) {
  return crypto.createHash("sha256").update(NET_PEPPER() + "|" + normaliseMac(mac), "utf8").digest("hex").slice(0, 32);
}

/* Deterministic device MAC generator for the campus polling agent records.
   `block` lets a scenario reuse one physical block of machines (a borrowed
   laboratory), which is exactly what the overlap detector must catch. */
export function deviceMac(index, block = 0) {
  /* Blocks are spaced far apart so that one institution's ephemeral pool can
     never collide with another institution's permanent estate. */
  const oui = [0x00, 0x1a, 0x2b];
  const n = (block * 100000 + index) >>> 0;
  return `${oui.map((o) => o.toString(16).padStart(2, "0")).join(":")}:` +
    [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((o) => o.toString(16).padStart(2, "0")).join(":");
}

export function deviceLabel(mac) {
  /* A display-safe label: vendor prefix plus the last two octets of the
     fingerprint, never the full hardware address. */
  const fp = deviceFingerprint(mac);
  return `host-${fp.slice(0, 4)}-${fp.slice(-4)}`;
}

/* Analysis of a polling window: 3 daily scans of the campus network. */
export function analyseNetworkPolls(polls, declaredSystems, cfg = {}) {
  const tol = Number(cfg.mac_count_tolerance_pct ?? 10);
  const days = [...polls]
    .filter((p) => p && p.status !== "Requested")
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map((p) => {
      const devices = Array.isArray(p.devices) ? p.devices : [];
      return { day: p.day, polled_at: p.polled_at || "", agent: p.agent || "", count: new Set(devices).size };
    });
  const seenOn = new Map(); // fingerprint -> number of days present
  for (const p of polls) {
    for (const d of new Set(Array.isArray(p.devices) ? p.devices : [])) {
      seenOn.set(d, (seenOn.get(d) || 0) + 1);
    }
  }
  const unique = seenOn.size;
  const stable = [...seenOn.values()].filter((n) => n >= 2).length;
  const churn = [...seenOn.values()].filter((n) => n === 1).length;
  const declared = Number(declaredSystems || 0);
  const variancePct = declared ? roundPy(((unique - declared) / declared) * 100, 1) : 0;
  const counting = days.length > 0 && declared > 0;
  const belowDeclared = counting && variancePct < -tol;
  return {
    declared_systems: declared,
    observed_unique: unique,
    polling_days: days.length,
    per_day: days,
    stable_devices: stable,
    churn_devices: churn,
    variance_pct: variancePct,
    tolerance_pct: tol,
    below_declared: belowDeclared,
    fingerprints: [...seenOn.keys()],
    note: "Counts come from the campus polling agent's daily sightings. Fingerprints are salted server-side; no raw hardware address is stored or shown.",
  };
}

export function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a || []);
  const B = b instanceof Set ? b : new Set(b || []);
  if (!A.size && !B.size) return 0;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return roundPy(shared / (A.size + B.size - shared), 4);
}

export function sharedDevices(a, b) {
  const B = b instanceof Set ? b : new Set(b || []);
  let shared = 0;
  for (const x of new Set(a || [])) if (B.has(x)) shared++;
  return shared;
}

/* Browser-side camera measurement submits four floor corners plus one
   calibrated edge. The server checks that the submission is well formed;
   the geometry itself is computed in the browser (public/scan.js). */
export function validateCameraScanPayload(bd) {
  const corners = Array.isArray(bd.corners) ? bd.corners : [];
  const problems = [];
  if (corners.length !== 4) problems.push("four floor corners are required");
  for (const c of corners) {
    if (!c || !Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y))) problems.push("each corner needs numeric coordinates");
  }
  const calib = Number(bd.calibration_edge_m);
  if (!(calib > 0.1 && calib < 60)) problems.push("the calibration edge must be between 0.1 m and 60 m");
  if (bd.frame_hash && !/^[0-9a-f]{16,64}$/i.test(String(bd.frame_hash))) problems.push("frame hash must be a hexadecimal digest");
  return problems;
}

/* ------------------------- Delta cache decision ---------------------------- */
/* Pure decision for one document, so the rule can be tested on its own:
   auto-pass only when nothing changed, the rules did not move and the
   validity date has not passed. */
export function deltaDecision({ cached, currentHash, ruleVersion, expiredNow }) {
  if (!cached) return { autoPass: false, status: "New this cycle" };
  if (cached.rule_version !== ruleVersion) return { autoPass: false, status: "Re-checked (rules updated)" };
  if (cached.content_hash !== currentHash) return { autoPass: false, status: "Modified — re-verified" };
  if (expiredNow) return { autoPass: false, status: "Re-checked (expiry reached)" };
  return { autoPass: true, status: "Auto-passed (unchanged)" };
}
