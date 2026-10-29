/* Seeded in-memory store.
   The initial dataset (lib/seed/db.json) is loaded once and deep-cloned into
   a mutable in-memory store. All interactions (uploads, validation runs,
   flag actions, scans, decisions) mutate this store exactly as database
   writes would. On serverless hosts the store lives as long as the
   instance stays warm and returns to the initial dataset on a cold start;
   see README for the hosted-database upgrade path. */
import seed from "./seed/db.json";
import { auditHash } from "./engines.js";

const TABLES = [
  "config", "institutions", "users", "checklist", "applications", "documents",
  "flags", "faculty", "financials", "rooms", "alerts", "audit", "registry",
];

function buildStore() {
  const data = JSON.parse(JSON.stringify(seed));
  const s = { epoch: 1, next: {}, _cfg: null, _registry: null };
  for (const t of TABLES) {
    s[t] = data[t] || [];
    s.next[t] = s[t].reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
  }
  return s;
}

export function getStore() {
  if (!globalThis.__AICTE_STORE__) globalThis.__AICTE_STORE__ = buildStore();
  return globalThis.__AICTE_STORE__;
}

export function resetStore() {
  const epoch = (globalThis.__AICTE_STORE__?.epoch || 1) + 1;
  globalThis.__AICTE_STORE__ = buildStore();
  globalThis.__AICTE_STORE__.epoch = epoch; // old login tokens stop working
  return globalThis.__AICTE_STORE__;
}

/* ------------------------------- helpers ----------------------------------- */

export function now() {
  return new Date().toISOString().slice(0, 19);
}

export function jparse(v, dflt) {
  if (v === null || v === undefined || v === "") return dflt;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return dflt;
  }
}

export function getConfig(s) {
  if (!s._cfg) {
    const row = s.config.find((r) => r.key === "main");
    s._cfg = row ? jparse(row.value, {}) : {};
  }
  return s._cfg;
}

export function setConfig(s, cfg) {
  s._cfg = cfg;
  const row = s.config.find((r) => r.key === "main");
  if (row) row.value = JSON.stringify(cfg);
  else s.config.push({ key: "main", value: JSON.stringify(cfg) });
}

export function registryMap(s) {
  if (!s._registry) {
    s._registry = new Map();
    for (const r of s.registry) s._registry.set(`${r.connector} ${r.ref}`, jparse(r.payload, {}));
  }
  return s._registry;
}

export function audit(s, actor, action, applicationId, detail) {
  const prev = s.audit.length ? s.audit[s.audit.length - 1] : null;
  const prevH = prev ? prev.hash : "GENESIS";
  const ts = now();
  s.audit.push({
    id: s.next.audit++,
    ts,
    actor,
    action,
    application_id: applicationId ?? null,
    detail: JSON.stringify(detail),
    prev_hash: prevH,
    hash: auditHash(prevH, ts, actor, action, detail),
  });
}

export function alert(s, appId, kind, message, forRole) {
  if (!s.alerts.some((a) => a.application_id === appId && a.message === message)) {
    s.alerts.push({
      id: s.next.alerts++,
      application_id: appId,
      kind,
      message,
      for_role: forRole,
      created_at: now(),
      seen: 0,
    });
  }
}

export function addFlag(s, appId, docId, key, module, severity, reason, evidence, confidence = 0.9) {
  if (s.flags.some((f) => f.application_id === appId && f.flag_key === key)) return false;
  s.flags.push({
    id: s.next.flags++,
    application_id: appId,
    document_id: docId ?? null,
    flag_key: key,
    module,
    severity,
    reason,
    evidence: JSON.stringify(evidence),
    confidence,
    status: "Open",
    officer_notes: "",
    created_at: now(),
  });
  if (severity === "High") {
    alert(s, appId, "Suspected anomaly", `High severity flag (${module}): ${reason}`, "officer");
  }
  return true;
}

/* ------------------------------- lookups ----------------------------------- */

export const instById = (s, id) => s.institutions.find((i) => i.id === id) || null;
export const appById = (s, id) => s.applications.find((a) => a.id === id) || null;
export const userById = (s, id) => s.users.find((u) => u.id === id) || null;
export const docById = (s, id) => s.documents.find((d) => d.id === id) || null;
export const checklistByCode = (s, code) => s.checklist.find((c) => c.code === code) || null;

/* ----------------------------- serialisers --------------------------------- */

export function appRow(s, r) {
  const d = { ...r };
  const inst = instById(s, r.institution_id);
  d.institution = inst ? { ...inst, intake: jparse(inst.intake, {}) } : {};
  const open = {};
  for (const f of s.flags) {
    if (f.application_id === r.id && f.status === "Open") open[f.severity] = (open[f.severity] || 0) + 1;
  }
  d.open_flags = open;
  d.open_total = Object.values(open).reduce((a, b) => a + b, 0);
  d.docs = s.documents.filter((x) => x.application_id === r.id).length;
  return d;
}

const SEV_ORDER = { High: 0, Medium: 1 };

export function applicationDetail(s, user, r) {
  const d = appRow(s, r);
  d.documents = s.documents
    .filter((x) => x.application_id === r.id)
    .sort((a, b) => (a.checklist_code < b.checklist_code ? -1 : a.checklist_code > b.checklist_code ? 1 : 0))
    .map((doc) => ({
      ...doc,
      extracted: jparse(doc.extracted, {}),
      source: jparse(doc.source, {}),
      forensic: jparse(doc.forensic, []),
    }));
  d.flags = s.flags
    .filter((f) => f.application_id === r.id)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2) || a.id - b.id)
    .map((f) => ({ ...f, evidence: jparse(f.evidence, {}) }));
  d.rooms = s.rooms
    .filter((x) => x.application_id === r.id)
    .map((room) => {
      const rr = { ...room };
      delete rr.true_l; // scan truth never ships to the browser
      delete rr.true_w;
      if (user.role.startsWith("College")) delete rr.challenge_code; // officer-held anti-spoof code
      rr.scan_result = jparse(rr.scan_result, {});
      return rr;
    });
  d.alerts = s.alerts
    .filter((a) => a.application_id === r.id)
    .sort((a, b) => b.id - a.id)
    .slice(0, 30)
    .map((a) => ({ ...a }));
  return d;
}
