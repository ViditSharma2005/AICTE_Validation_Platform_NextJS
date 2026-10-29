/* API for the AICTE Application Validation and Compliance Portal.
   One catch-all Route Handler with an explicit dispatch table; every
   endpoint mirrors the portal's JSON contract ({detail} on errors). */
import { NextResponse } from "next/server";
import * as E from "@/lib/engines.js";
import {
  getStore, resetStore, now, jparse, getConfig, setConfig, registryMap,
  audit, alert, addFlag, instById, appById, docById, checklistByCode,
  appRow, applicationDetail, deltaSummary,
} from "@/lib/store.js";
import {
  HttpError, signToken, currentUser, requireRole, publicUser, canSee, getApplicationOr404,
} from "@/lib/auth.js";
import { demoVariants, insertApplication, insertDoc, storeAfterM1, runValidation, graphFor, networkFor, submitPollWindow } from "@/lib/pipeline.js";
import { answerChat } from "@/lib/chat.js";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ok = (data, status = 200) => NextResponse.json(data, { status });
const err = (e) =>
  e instanceof HttpError
    ? NextResponse.json({ detail: e.detail }, { status: e.status })
    : (console.error(e), NextResponse.json({ detail: "Internal error: " + (e?.message || e) }, { status: 500 }));

async function dispatch(req, seg) {
  const s = getStore();
  const m = req.method;
  const sp = new URL(req.url).searchParams;
  const body = async () => (await req.json().catch(() => ({}))) || {};
  const [a, b, c, d, e2] = seg;

  /* ------------------------------- health / meta --------------------------- */
  if (m === "GET" && a === "health") {
    return ok({ ok: true, service: "AICTE Application Validation and Compliance Portal", storage: "Next.js server store" });
  }

  if (m === "GET" && a === "meta") {
    const items = [...s.checklist]
      .sort((x, y) => (x.code < y.code ? -1 : 1))
      .map((it) => ({ ...it, required_fields: jparse(it.required_fields, []), modules: jparse(it.modules, []) }));
    return ok({
      checklist: items,
      rule_version: s.rule_version,
      config: getConfig(s),
      statuses: [
        "Verified", "Mismatch detected", "Expired", "Verification pending",
        "Source unavailable", "Manual review required", "Declared (not verifiable)",
      ],
    });
  }

  /* --------------------------------- chat ---------------------------------- */
  if (m === "POST" && a === "chat") {
    return ok(await answerChat(await body()));
  }

  /* --------------------------------- auth ---------------------------------- */
  if (m === "POST" && a === "login") {
    const bd = await body();
    const email = String(bd.email || "").trim().toLowerCase();
    const row = s.users.find((u) => u.email === email && u.password === String(bd.password || ""));
    if (!row) throw new HttpError(401, "Email or password does not match a portal account");
    audit(s, row.email, "LOGIN", null, { role: row.role });
    return ok({ token: signToken(row.id, s.epoch), user: publicUser(row) });
  }

  if (m === "GET" && a === "me") {
    return ok(publicUser(currentUser(req)));
  }

  /* ------------------------------ applications ----------------------------- */
  if (m === "GET" && a === "applications" && !b) {
    const user = currentUser(req);
    const q = (sp.get("q") || "").toLowerCase();
    const state = sp.get("state") || "";
    const statusF = sp.get("status") || "";
    const risk = sp.get("risk") || "";
    let out = [...s.applications]
      .sort((x, y) => y.risk_score - x.risk_score || x.id - y.id)
      .filter((r) => canSee(user, r))
      .map((r) => appRow(s, r));
    if (q) out = out.filter((d2) => (d2.institution.name + " " + d2.institution.city + " " + d2.institution.state + " " + d2.institution.trust).toLowerCase().includes(q));
    if (state) out = out.filter((d2) => d2.institution.state === state);
    if (statusF) out = out.filter((d2) => d2.status === statusF);
    if (risk) out = out.filter((d2) => d2.risk_level === risk);
    if (user.role.startsWith("College")) {
      // Colleges work newest-first with the live draft on top.
      out.sort((x, y) => (x.academic_year < y.academic_year ? 1 : x.academic_year > y.academic_year ? -1 : 0));
      out.sort((x, y) => (x.status !== "Draft") - (y.status !== "Draft"));
    }
    return ok(out);
  }

  if (m === "POST" && a === "applications" && !b) {
    const user = currentUser(req);
    requireRole(user, "College Admin");
    const bd = await body();
    const appId = insertApplication(
      s, user.institution_id,
      bd.category || "Extension of Approval (renewal)",
      bd.academic_year || "2027-28", "Draft", now().slice(0, 10)
    );
    audit(s, user.email, "APPLICATION_CREATED", appId, { category: bd.category ?? null });
    return ok(appRow(s, appById(s, appId)));
  }

  if (m === "GET" && a === "applications" && b && !c) {
    const user = currentUser(req);
    return ok(applicationDetail(s, user, getApplicationOr404(s, Number(b), user)));
  }

  if (m === "POST" && a === "applications" && b && c === "submit") {
    const user = currentUser(req);
    requireRole(user, "College Admin");
    const application = getApplicationOr404(s, Number(b), user);
    application.status = "Under officer review";
    application.submitted_at = now();
    audit(s, user.email, "APPLICATION_SUBMITTED", application.id, {});
    const result = runValidation(s, application.id, user.email);
    alert(s, application.id, "New submission", "Application submitted and validation completed", "officer");
    return ok({ ok: true, ...result });
  }

  if (m === "POST" && a === "applications" && b && c === "validate") {
    const user = currentUser(req);
    const application = getApplicationOr404(s, Number(b), user);
    return ok({ ok: true, ...runValidation(s, application.id, user.email) });
  }

  if (m === "POST" && a === "applications" && b && c === "decision") {
    const user = currentUser(req);
    requireRole(user, "Senior Officer"); // the one human decision step
    const bd = await body();
    const dec = String(bd.decision || "").trim();
    if (!["EoA recommended", "EoA recommended with conditions", "Inspection before decision", "Not recommended"].includes(dec)) {
      throw new HttpError(400, "Pick one of the four recorded decisions");
    }
    const application = getApplicationOr404(s, Number(b), user);
    application.decision = dec;
    application.decision_notes = bd.notes || "";
    application.status = "Decision recorded";
    audit(s, user.email, "DECISION_RECORDED", application.id, {
      decision: dec, notes: bd.notes || "",
      note: "Recorded by a Senior Officer. No automated decision was taken.",
    });
    alert(s, application.id, "Decision recorded", `Senior Officer decision: ${dec}`, "both");
    return ok({ ok: true });
  }

  if (m === "POST" && a === "applications" && b && c === "recommend-inspection") {
    const user = currentUser(req);
    requireRole(user, "Scrutiny Officer", "Senior Officer");
    const application = getApplicationOr404(s, Number(b), user);
    application.inspection = 1;
    application.status = "Inspection recommended";
    audit(s, user.email, "INSPECTION_RECOMMENDED", application.id, {});
    alert(s, application.id, "Inspection recommended", "A physical inspection has been recommended by the scrutiny officer", "both");
    return ok({ ok: true });
  }

  /* --------------------------- faculty / finance / graph ------------------- */
  if (m === "GET" && a === "applications" && b && c === "faculty") {
    const user = currentUser(req);
    const application = getApplicationOr404(s, Number(b), user);
    const inst = instById(s, application.institution_id);
    const rows = s.faculty
      .filter((f) => f.application_id === application.id)
      .sort((x, y) => (x.designation < y.designation ? -1 : x.designation > y.designation ? 1 : x.name < y.name ? -1 : 1))
      .map((f) => ({ ...f }));
    if (!rows.length) return ok({ empty: true, note: "No faculty register filed yet. Upload checklist item E1." });
    const students = parseInt(jparse(inst.intake, {}).CSE || 0, 10) * 4;
    return ok(E.facultyCompliance(rows, students, getConfig(s), application.application_date));
  }

  if (m === "GET" && a === "applications" && b && c === "financial") {
    const user = currentUser(req);
    const application = getApplicationOr404(s, Number(b), user);
    const fin = s.financials.find((f) => f.application_id === application.id);
    if (!fin) return ok({ empty: true, note: "No audited accounts filed yet (checklist C1)." });
    const cfg = getConfig(s);
    const ben = jparse(fin.benford, null) || E.benford(jparse(fin.numbers, []), cfg.benford_min_n, cfg.benford_mad_limit);
    const registry = registryMap(s);
    const fdrDoc = s.documents.find((d2) => d2.application_id === application.id && d2.checklist_code === "C3");
    let bankAmt = null, rpgfAmt = null;
    if (fdrDoc) {
      const ff = jparse(fdrDoc.extracted, {}).fields || {};
      const src = registry.get(`Bank ${ff.fdr_number}`) || {};
      bankAmt = src.amount_inr ? parseInt(src.amount_inr, 10) : null;
      rpgfAmt = ff.amount_inr ? parseInt(ff.amount_inr, 10) : null;
    }
    return ok({
      benford: ben,
      totals_ok: !!fin.totals_ok,
      reconciliation: E.reconcileFdr(bankAmt, fin.accounts_fdr, rpgfAmt),
      numbers_count: jparse(fin.numbers, []).length,
    });
  }

  if (m === "GET" && a === "applications" && b && c === "graph") {
    const user = currentUser(req);
    return ok(graphFor(s, getApplicationOr404(s, Number(b), user)));
  }

  /* --------------------------- network evidence (MAC) ---------------------- */
  if (m === "GET" && a === "applications" && b && c === "network") {
    const user = currentUser(req);
    const application = getApplicationOr404(s, Number(b), user);
    return ok(networkFor(s, application));
  }

  if (m === "POST" && a === "applications" && b && c === "network" && d === "request-poll") {
    const user = currentUser(req);
    requireRole(user, "Scrutiny Officer", "Senior Officer");
    const application = getApplicationOr404(s, Number(b), user);
    const open = s.network_polls.find((p) => p.application_id === application.id && p.status === "Requested");
    if (!open) {
      s.network_polls.push({
        id: s.next.network_polls++,
        application_id: application.id,
        day: now().slice(0, 10),
        polled_at: now(),
        agent: "",
        status: "Requested",
        devices: JSON.stringify([]),
      });
    }
    audit(s, user.email, "NETWORK_POLL_REQUESTED", application.id, {
      note: "Officer asked the college for a fresh three-day device polling window.",
    });
    alert(s, application.id, "Device polling requested", "Officer requested a fresh network polling window for this campus", "college");
    return ok({
      ok: true,
      note: "The college submits a three-day polling window from the campus agent. Fingerprints are salted server-side and compared across institutions.",
    });
  }

  if (m === "POST" && a === "applications" && b && c === "network" && d === "submit-poll") {
    const user = currentUser(req);
    requireRole(user, "College Admin");
    const application = getApplicationOr404(s, Number(b), user);
    const row = submitPollWindow(s, application, user.email);
    const result = runValidation(s, application.id, user.email);
    alert(s, application.id, "Device polling received", `Polling window ${row.day} submitted; checks re-run`, "officer");
    return ok({ ok: true, poll: { day: row.day }, ...result, network: networkFor(s, application) });
  }

  /* ------------------------------- documents / M1 -------------------------- */
  if (m === "GET" && a === "demo-files") {
    const user = currentUser(req);
    let name = sp.get("institution") || "";
    if (!name && user.institution_id) name = instById(s, user.institution_id)?.name || "";
    return ok(
      Object.entries(demoVariants(name || "Aarav Institute of Technology")).map(([key, v]) => ({
        key, label: v.label, filename: v.filename, checklist_code: v.checklist_code, scenario: v.scenario,
      }))
    );
  }

  if (m === "POST" && a === "applications" && b && c === "documents" && d === "demo-upload") {
    const user = currentUser(req);
    requireRole(user, "College Admin", "College Staff");
    const bd = await body();
    const application = getApplicationOr404(s, Number(b), user);
    const inst = instById(s, application.institution_id);
    const variants = demoVariants(inst.name);
    let variant = variants[bd.variant || ""];
    if (!variant) throw new HttpError(400, "Unknown desk file");
    const code = bd.checklist_code || variant.checklist_code;
    if (!code) throw new HttpError(400, "Choose which checklist item this file belongs to");
    variant = { ...variant, checklist_code: code };
    const item = checklistByCode(s, code);
    if (!item) throw new HttpError(400, "Unknown checklist item");
    const required = jparse(item.required_fields, []);
    let fields = { ...variant.fields };
    if (bd.variant === "generic_clean") {
      fields = {};
      for (const f of required) fields[f] = f === "signature_present" ? true : `readable value (${f})`;
      if (!("institution_name" in fields)) fields.institution_name = inst.name;
    }
    if (bd.variant === "generic_incomplete") {
      fields = {};
      for (const f of required.slice(0, -1)) fields[f] = "partially legible";
    }
    variant.fields = fields;
    const result = E.m1Evaluate(required, fields, variant.confidence);
    if (result.outcome === "Returned for fix" && !bd.force_manual) {
      audit(s, user.email, "M1_RETURNED_FOR_FIX", application.id, { file: variant.filename, reasons: result.reasons });
      return ok({
        m1: result, stored: false,
        note: "Returned at the gate: this is a request to fix and re-upload, not a regulatory rejection.",
      });
    }
    const outcome = bd.force_manual || result.outcome !== "Accepted" ? "Manual review required" : "Accepted";
    const docId = storeAfterM1(s, application.id, variant, outcome, user);
    if (outcome === "Manual review required") docById(s, docId).verification_status = "Manual review required";
    // onward processing (source comparison and all checks) so fresh filings
    // update flags and risk immediately
    runValidation(s, application.id, user.email);
    const doc = docById(s, docId);
    if (outcome === "Manual review required" && doc) doc.verification_status = "Manual review required";
    return ok({
      m1: result, stored: true, document_id: docId, outcome,
      delta_status: doc ? doc.delta_status : null,
      delta: deltaSummary(s, application.id),
    });
  }

  if (m === "POST" && a === "applications" && b && c === "documents" && d === "upload") {
    const user = currentUser(req);
    requireRole(user, "College Admin", "College Staff");
    const fd = await req.formData().catch(() => null);
    const file = fd?.get("file");
    const checklistCode = String(fd?.get("checklist_code") || "");
    if (!file || typeof file === "string") throw new HttpError(400, "Choose a file to upload");
    if (file.size > 15 * 1024 * 1024) throw new HttpError(400, "File is over the 15 MB upload limit");
    const dot = (file.name || "").lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (![".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".csv", ".txt"].includes(ext)) {
      return ok({
        m1: {
          outcome: "Returned for fix",
          reasons: [`File type ${ext || "unknown"} is not accepted; use PDF, JPG, PNG, XLSX or CSV`],
          confidence: 1.0,
        },
        stored: false,
      });
    }
    const application = getApplicationOr404(s, Number(b), user);
    if (!checklistByCode(s, checklistCode)) throw new HttpError(400, "Choose a checklist item first");
    const data = Buffer.from(await file.arrayBuffer());
    const phash = [".jpg", ".jpeg", ".png"].includes(ext) ? (await E.ahashFromImageBytes(data)) || "" : "";
    const storedName = `${application.id}_${checklistCode}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const result = {
      outcome: "Accepted with manual review",
      reasons: [
        "The file was received. Files that cannot be read automatically are routed to manual review; the image hash was indexed for duplicate checks.",
      ],
      confidence: 0.5,
    };
    const variant = {
      checklist_code: checklistCode, filename: file.name,
      fields: { stored_file: storedName, bytes: file.size },
      confidence: 0.5, forensic: [], phash, scenario: "",
    };
    s.documents = s.documents.filter((x) => !(x.application_id === application.id && x.checklist_code === checklistCode));
    const docId = insertDoc(s, application.id, variant, "Manual review required");
    docById(s, docId).verification_status = "Manual review required";
    audit(s, user.email, "DOCUMENT_UPLOADED", application.id, { file: file.name, bytes: file.size, phash_indexed: !!phash });
    runValidation(s, application.id, user.email);
    const after = docById(s, docId);
    if (after) after.verification_status = "Manual review required";
    return ok({
      m1: result, stored: true, document_id: docId, phash_indexed: !!phash,
      delta_status: after ? after.delta_status : null,
      delta: deltaSummary(s, application.id),
    });
  }

  if (m === "GET" && a === "documents" && b) {
    const user = currentUser(req);
    const doc = docById(s, Number(b));
    if (!doc) throw new HttpError(404, "Document not found");
    getApplicationOr404(s, doc.application_id, user);
    audit(s, user.email, "DOCUMENT_VIEWED", doc.application_id, { document_id: doc.id });
    return ok({
      ...doc,
      extracted: jparse(doc.extracted, {}),
      source: jparse(doc.source, {}),
      forensic: jparse(doc.forensic, []),
      flags: s.flags
        .filter((f) => f.document_id === doc.id)
        .sort((x, y) => x.id - y.id)
        .map((f) => ({ ...f, evidence: jparse(f.evidence, {}) })),
    });
  }

  /* ---------------------------------- flags -------------------------------- */
  if (m === "PATCH" && a === "flags" && b) {
    const user = currentUser(req);
    requireRole(user, "Scrutiny Officer", "Senior Officer");
    const bd = await body();
    const newStatus = bd.status || "";
    if (!["Accepted", "Clarification requested", "Escalated", "Resolved", "Open"].includes(newStatus)) {
      throw new HttpError(400, "Flag status must be Accepted, Clarification requested, Escalated, Resolved or Open");
    }
    const flag = s.flags.find((f) => f.id === Number(b));
    if (!flag) throw new HttpError(404, "Flag not found");
    const from = flag.status;
    flag.status = newStatus;
    if ("notes" in bd) flag.officer_notes = bd.notes ?? flag.officer_notes;
    if (newStatus === "Clarification requested") {
      const application = appById(s, flag.application_id);
      if (application && application.status === "Under officer review") application.status = "Awaiting college response";
      alert(s, flag.application_id, "Evidence requested", `Officer requested clarification: ${String(flag.reason).slice(0, 120)}`, "college");
    }
    audit(s, user.email, "FLAG_ACTION", flag.application_id, {
      flag_id: flag.id, from, to: newStatus, notes: bd.notes || "",
    });
    // risk follows open flags
    const flags = s.flags.filter((f) => f.application_id === flag.application_id);
    const [score, level, inspection] = E.riskFromFlags(flags, getConfig(s));
    const application = appById(s, flag.application_id);
    application.risk_score = score;
    application.risk_level = level;
    application.inspection = inspection ? 1 : 0;
    return ok({ ok: true, risk_score: score, risk_level: level });
  }

  /* ---------------------------------- AR / M2 ------------------------------ */
  if (m === "POST" && a === "applications" && b && c === "rooms" && d && e2 === "request-scan") {
    const user = currentUser(req);
    requireRole(user, "Scrutiny Officer", "Senior Officer"); // officer picks the room
    const application = getApplicationOr404(s, Number(b), user);
    const room = s.rooms.find((r) => r.id === Number(d) && r.application_id === application.id);
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
    if (room) {
      room.scan_status = "Requested";
      room.challenge_code = code;
    }
    audit(s, user.email, "AR_SCAN_REQUESTED", application.id, { room: room ? room.name : Number(d), challenge_code_issued: true });
    alert(s, application.id, "AR scan requested", `Officer requested a live room measurement: ${room ? room.name : ""}`, "college");
    return ok({
      ok: true, challenge_code: code,
      note: "Read this code to the person scanning; it must be typed into the scan screen. It is never shown on the college side by itself.",
    });
  }

  if (m === "POST" && a === "rooms" && b && c === "scan") {
    const user = currentUser(req);
    requireRole(user, "College Admin");
    const bd = await body();
    const room = s.rooms.find((r) => r.id === Number(b));
    if (!room) throw new HttpError(404, "Room not found");
    const application = getApplicationOr404(s, room.application_id, user);
    if (room.scan_status !== "Requested") throw new HttpError(400, "No officer scan request is open for this room");
    if (String(bd.challenge_code || "").trim().toUpperCase() !== String(room.challenge_code || "").toUpperCase()) {
      throw new HttpError(400, "Challenge code does not match the code on the officer dashboard. Ask the officer to read it out and scan again.");
    }
    const cfg = getConfig(s);
    let ml, mw, mh, src;
    const mode = bd.mode || "replay";
    if (mode === "camera") {
      const problems = E.validateCameraScanPayload(bd);
      if (problems.length) throw new HttpError(400, `Camera measurement incomplete: ${problems.join("; ")}`);
      const geometry = E.validateCameraGeometry(bd);
      if (geometry.length) throw new HttpError(400, `Camera measurement rejected: ${geometry.join("; ")}`);
      ml = Number(bd.measured_l); mw = Number(bd.measured_w);
      mh = Number(bd.measured_h || room.claimed_h);
      if (!(ml > 0.5 && ml < 100 && mw > 0.5 && mw < 100)) {
        throw new HttpError(400, "Measured length and width must be between 0.5 m and 100 m");
      }
      src = "Live camera corner-marking measurement (single-view perspective rectification) in the browser";
    } else if (mode === "replay") {
      // Recorded-session replay of an ARCore corner-marking scan.
      ml = room.true_l; mw = room.true_w; mh = room.claimed_h;
      src = "Recorded ARCore session replay (web scan submission)";
    } else {
      ml = Number(bd.measured_l); mw = Number(bd.measured_w);
      mh = Number(bd.measured_h || room.claimed_h);
      if (!ml || !mw) throw new HttpError(400, "Enter measured length and width in metres");
      if (!(ml > 0.5 && ml < 100 && mw > 0.5 && mw < 100)) {
        throw new HttpError(400, "Measured length and width must be between 0.5 m and 100 m");
      }
      src = "Manual entry of tape / AR measurement by college";
    }
    const inst = instById(s, application.institution_id);
    const lat = Number(bd.lat ?? inst.lat);
    const lng = Number(bd.lng ?? inst.lng);
    const [inside, distM] = E.withinGeofence(inst.lat, inst.lng, lat, lng);
    const result = E.arCompare(room.claimed_l, room.claimed_w, ml, mw, cfg.ar_tolerance_pct);
    Object.assign(result, {
      source: src,
      mode,
      gps: { lat, lng, inside_campus_geofence: inside, distance_from_campus_centre_m: distM },
      challenge_code_matched: true,
      device: bd.device || (mode === "camera" ? "Browser camera" : "Android (ARCore)"),
      capture_hash: mode === "camera" && bd.frame_hash
        ? String(bd.frame_hash).slice(0, 64)
        : crypto.randomBytes(8).toString("hex"),
      corners: mode === "camera" ? (bd.corners || []).map((c) => ({ x: Number(c.x), y: Number(c.y) })) : undefined,
      calibration_edge_m: mode === "camera" ? Number(bd.calibration_edge_m) : undefined,
      focal_px: mode === "camera" ? Number(bd.focal_px || 0) : undefined,
      camera_note: mode === "camera"
        ? "Measured from four corner marks on a live camera frame with one tape-measured edge as the scale. Perspective rectification, not a native ARCore/ARKit depth scan; read with the tolerance and the physical inspection rule."
        : undefined,
    });
    room.measured_l = ml; room.measured_w = mw; room.measured_h = mh;
    room.scan_status = "Scanned";
    room.scan_result = JSON.stringify(result);
    room.scanned_at = now();
    if (result.result === "Out of tolerance" || !inside) {
      let why =
        `${room.name}: measured ${result.measured_area_sqm} sq m against claimed ${result.claimed_area_sqm} sq m ` +
        `(${result.diff_pct}% , tolerance ${cfg.ar_tolerance_pct}%). Recommendation: schedule a physical inspection. ` +
        "This is advisory, not a fraud finding.";
      if (!inside) {
        why = `${room.name}: scan GPS sits ${distM} m from the declared campus centre, outside the 600 m geofence. Treat the scan as invalid until repeated on site.`;
      }
      addFlag(s, room.application_id, null, `M2-${room.id}-${now().slice(0, 16)}`, "M2", !inside ? "High" : "Medium", why, { scan: result, room: room.name }, 0.88);
    }
    audit(s, user.email, "AR_SCAN_SUBMITTED", room.application_id, {
      room: room.name, result: result.result, diff_pct: result.diff_pct, geofence_inside: inside,
    });
    alert(s, room.application_id, "AR result received", `${room.name}: ${result.result} (${result.diff_pct}% against claim)`, "officer");
    return ok({ ok: true, scan: result });
  }

  /* ------------------------------ alerts / audit --------------------------- */
  if (m === "GET" && a === "alerts") {
    const user = currentUser(req);
    const rows = [...s.alerts].sort((x, y) => y.id - x.id).slice(0, 60);
    const out = [];
    for (const r of rows) {
      const application = appById(s, r.application_id);
      const inst = application ? instById(s, application.institution_id) : null;
      if (user.role.startsWith("College")) {
        if (!application || application.institution_id !== user.institution_id || r.for_role === "officer") continue;
      } else if (r.for_role === "college") continue;
      out.push({ ...r, institution: inst ? inst.name : "" });
    }
    return ok(out);
  }

  if (m === "POST" && a === "alerts" && b && c === "seen") {
    currentUser(req);
    const al = s.alerts.find((x) => x.id === Number(b));
    if (al) al.seen = 1;
    return ok({ ok: true });
  }

  if (m === "GET" && a === "audit") {
    const user = currentUser(req);
    const applicationId = Number(sp.get("application_id") || 0);
    const limit = Number(sp.get("limit") || 120);
    let rows = [...s.audit];
    if (applicationId) {
      getApplicationOr404(s, applicationId, user);
      rows = rows.filter((r) => r.application_id === applicationId);
    } else if (user.role.startsWith("College")) {
      const myApps = new Set(s.applications.filter((x) => x.institution_id === user.institution_id).map((x) => x.id));
      rows = rows.filter((r) => myApps.has(r.application_id) || r.actor === user.email);
    }
    return ok(
      rows.sort((x, y) => y.id - x.id).slice(0, limit).map((r) => ({ ...r, detail: jparse(r.detail, {}) }))
    );
  }

  /* --------------------------------- metrics ------------------------------- */
  if (m === "GET" && a === "metrics") {
    currentUser(req);
    const byModule = {};
    for (const f of s.flags) byModule[f.module] = (byModule[f.module] || 0) + 1;
    const byStatus = {};
    for (const d2 of s.documents) {
      const k = d2.verification_status || "Not run";
      byStatus[k] = (byStatus[k] || 0) + 1;
    }
    const checks = [
      ["S1", "Affidavit missing signature, wrong stamp value", "M1 bounce at upload", "Try it in the Aarav 2027-28 draft with the unsigned affidavit"],
      ["S2", "Fire certificate with edited expiry date", "M4 two-signal flag + M3 mismatch", "Aarav 2026-27, document B8"],
      ["S3", "NAAC grade inflated A+ against source B++", "M3 mismatch", "Aarav 2026-27, document I1"],
      ["S4", "Classroom claimed 58.2 sq m, measures 50.0 sq m", "M2 out of tolerance at -14.1%", "Request a scan of C-204 as officer, scan as college"],
      ["S5", "Ledger digit anomaly + three-way FDR disagreement", "M5 Benford non-conformity + reconciliation", "Aarav 2026-27, Finance section"],
      ["S6", "Two dummy teachers, one unmatched degree, one shared professor", "M6 + M7 flags", "Aarav 2026-27, Faculty section"],
      ["S7", "Lab photo reused after resize", "M4 pHash distance 3 of 64 + M7 link", "Aarav F7 against Malwa F7"],
      ["S8", "Same land deed in two applications", "M7 shared-parcel flag", "Aniket and Janata, deed LND-MH-8841"],
      ["S9", "Clean application", "No false alarms; risk stays Low", "Malwa College of Engineering"],
    ];
    return ok({
      applications: s.applications.length,
      documents: s.documents.length,
      flags_by_module: byModule,
      documents_by_status: byStatus,
      scenarios: checks.map(([id, what, catch_, where]) => ({ id, seeded: what, expected_catch: catch_, where })),
      manual_baseline_note:
        "Time-saved estimates use a stated manual baseline of 2–3 working days of scrutiny per application file.",
    });
  }

  /* ---------------------------------- admin -------------------------------- */
  if (m === "GET" && a === "admin" && b === "config") {
    const user = currentUser(req);
    requireRole(user, "System Admin", "Senior Officer", "Scrutiny Officer", "Auditor");
    return ok(getConfig(s));
  }

  if (m === "PUT" && a === "admin" && b === "config") {
    const user = currentUser(req);
    requireRole(user, "System Admin");
    const bd = await body();
    const cfg = { ...getConfig(s) };
    for (const k of [
      "sfr_target", "ar_tolerance_pct", "phash_distance", "benford_min_n", "benford_mad_limit",
      "risk_weights", "risk_high_at", "risk_medium_at", "low_pay_threshold_inr",
      "joined_recent_days", "cadre_ratio", "connectors", "external_ai_enabled",
    ]) {
      if (k in bd) cfg[k] = bd[k];
    }
    setConfig(s, cfg);
    s.rule_version += 1;
    audit(s, user.email, "CONFIG_CHANGED", null, {
      changed: Object.keys(bd), rule_version: s.rule_version,
      note: "Rule changes are versioned: every verified document is re-checked against the new rule version.",
    });
    return ok({ ...cfg, rule_version: s.rule_version });
  }

  if (m === "PUT" && a === "admin" && b === "checklist" && c) {
    const user = currentUser(req);
    requireRole(user, "System Admin");
    const bd = await body();
    const item = checklistByCode(s, c);
    if (!item) throw new HttpError(404, "Checklist item not found");
    item.mandatory = (bd.mandatory ?? true) ? 1 : 0;
    if (bd.severity !== undefined) item.severity = bd.severity;
    s.rule_version += 1;
    audit(s, user.email, "RULE_CHANGED", null, {
      checklist: c, mandatory: bd.mandatory ?? null, severity: bd.severity ?? null,
      rule_version: s.rule_version,
      note: "Checklist rule change; cached verifications are re-checked under the new version.",
    });
    return ok({ ok: true, rule_version: s.rule_version });
  }

  if (m === "GET" && a === "admin" && b === "users") {
    const user = currentUser(req);
    requireRole(user, "System Admin", "Auditor");
    return ok(
      s.users.map((u) => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        institution: u.institution_id ? instById(s, u.institution_id)?.name ?? null : null,
      }))
    );
  }

  if (m === "POST" && a === "admin" && b === "reset-demo") {
    const user = currentUser(req);
    requireRole(user, "System Admin");
    resetStore();
    return ok({ ok: true, note: "Dataset restored to its initial state. Sign in again." });
  }

  throw new HttpError(404, "Not found");
}

export async function GET(req, { params }) {
  try { return await dispatch(req, params.path || []); } catch (e) { return err(e); }
}
export async function POST(req, { params }) {
  try { return await dispatch(req, params.path || []); } catch (e) { return err(e); }
}
export async function PATCH(req, { params }) {
  try { return await dispatch(req, params.path || []); } catch (e) { return err(e); }
}
export async function PUT(req, { params }) {
  try { return await dispatch(req, params.path || []); } catch (e) { return err(e); }
}
