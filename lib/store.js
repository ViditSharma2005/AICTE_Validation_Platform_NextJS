/* Seeded in-memory store.
   The initial dataset (lib/seed/db.json) is loaded once and deep-cloned into
   a mutable in-memory store. All interactions (uploads, validation runs,
   flag actions, scans, decisions) mutate this store exactly as database
   writes would. On serverless hosts the store lives as long as the
   instance stays warm and returns to the initial dataset on a cold start;
   see README for the hosted-database upgrade path. */
import seed from "./seed/db.json";
import { auditHash, contentHash, deviceFingerprint, deviceMac } from "./engines.js";

const TABLES = [
  "config", "institutions", "users", "checklist", "applications", "documents",
  "flags", "faculty", "financials", "rooms", "alerts", "audit", "registry",
  "delta_cache", "network_polls",
];

/* Declared computer systems per institution. Held here rather than in the
   seed file so the published dataset keeps its exact shape. These are the
   numbers a college enters in its EoA form and the campus polling agent is
   measured against. */
const DECLARED_SYSTEMS = {
  Aarav: 240, Malwa: 260, Janata: 180, Kochi: 150,
  Greenfield: 300, northgate: 160, riverside: 170, highland: 90,
};

const POLL_DAYS = ["2026-10-20", "2026-10-21", "2026-10-22"];

/* One polling window: `permanent` machines seen on all three days,
   `varied` split across two days, `churn` seen on a single day only.
   `shared` machines are drawn from another block's range on purpose: the
   same physical host, so the same salted fingerprint. */
function macs(block, from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(deviceMac(i, block));
  return out;
}

function buildPollWindow(applicationId, { block, permanent, varied, churn, sharedBlock = null, sharedCount = 0 }) {
  const perm = macs(block, 1, permanent);
  const v = macs(block, 1001, 1000 + varied);
  const c = macs(block, 2001, 2000 + churn);
  const shared = sharedBlock ? macs(sharedBlock, 1, sharedCount) : [];
  const half = Math.floor(v.length / 2);
  const vA = v.slice(0, half), vB = v.slice(half);
  const c3 = Math.ceil(c.length / 3);
  const cA = c.slice(0, c3), cB = c.slice(c3, c3 * 2), cC = c.slice(c3 * 2);
  // shared machines belong to the borrowing college's permanent estate as well
  const permAll = [...perm, ...shared];
  const days = [
    [...permAll, ...vA, ...cA],
    [...permAll, ...vA, ...vB, ...cB],
    [...permAll, ...vB, ...cC],
  ].map((list) => [...new Set(list.map(deviceFingerprint))]);
  return days.map((devices, i) => ({
    application_id: applicationId,
    day: POLL_DAYS[i],
    polled_at: `${POLL_DAYS[i]}T07:${String(10 + i).padStart(2, "0")}:00`,
    agent: "campus polling agent v1.2",
    status: "Completed",
    devices: JSON.stringify(devices),
  }));
}

function seedNetworkPolls(s) {
  const add = (appId, opts) => {
    for (const row of buildPollWindow(appId, opts)) {
      s.network_polls.push({ id: s.next.network_polls++, ...row });
    }
  };
  // Aniket (application 2): a stable estate, fewer machines than declared, and
  // sixty machines that also answer on Janata's network.
  add(2, { block: 1, permanent: 96, varied: 18, churn: 6, sharedBlock: 4, sharedCount: 60 });
  // Janata (application 4): the same sixty physical hosts, plus its own estate.
  add(4, { block: 2, permanent: 99, varied: 12, churn: 4, sharedBlock: 4, sharedCount: 60 });
  // Malwa (application 3): the clean control — a full, stable estate of its own.
  add(3, { block: 3, permanent: 236, varied: 6, churn: 3 });
}

/* The Delta Processing Cache is pre-filled from the seeded dataset: documents
   already verified against their issuing authority keep that verdict until
   their content or the rules change. */
function prefillDeltaCache(s) {
  for (const doc of s.documents) {
    if (doc.verification_status !== "Verified") continue;
    const ext = jparse(doc.extracted, {});
    s.delta_cache.push({
      id: s.next.delta_cache++,
      application_id: doc.application_id,
      checklist_code: doc.checklist_code,
      content_hash: contentHash({ fields: ext.fields || {}, filename: doc.filename, phash: doc.phash }),
      status: "Verified",
      rule_version: s.rule_version,
      source: doc.source || "",
      verified_at: doc.uploaded_at || now(),
    });
  }
}

function buildStore() {
  const data = JSON.parse(JSON.stringify(seed));
  const s = { epoch: 1, rule_version: 1, next: {}, _cfg: null, _registry: null };
  for (const t of TABLES) {
    s[t] = data[t] || [];
    s.next[t] = s[t].reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
  }
  for (const inst of s.institutions) inst.declared_systems = DECLARED_SYSTEMS[inst.key] ?? 0;
  seedNetworkPolls(s);
  prefillDeltaCache(s);
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

/* Delta status of one document: compares the stored content hash and rule
   version against the cache entry written the last time it was verified. */
export function deltaState(s, doc) {
  const ext = jparse(doc.extracted, {});
  const hash = contentHash({ fields: ext.fields || {}, filename: doc.filename, phash: doc.phash });
  const row = s.delta_cache.find(
    (c) => c.application_id === doc.application_id && c.checklist_code === doc.checklist_code
  );
  if (!row) return { status: "New this cycle", content_hash: hash, rule_version: s.rule_version };
  if (row.rule_version !== s.rule_version) {
    return { status: "Re-checked (rules updated)", content_hash: hash, cached_rule_version: row.rule_version, rule_version: s.rule_version };
  }
  if (row.content_hash !== hash) {
    return { status: "Modified — re-verified", content_hash: hash, cached_hash: row.content_hash, rule_version: s.rule_version };
  }
  return { status: "Auto-passed (unchanged)", content_hash: hash, cached_at: row.verified_at, rule_version: row.rule_version };
}

export function deltaSummary(s, appId) {
  const docs = s.documents.filter((d) => d.application_id === appId);
  const counts = {
    "Auto-passed (unchanged)": 0,
    "Modified — re-verified": 0,
    "New this cycle": 0,
    "Re-checked (rules updated)": 0,
  };
  for (const d of docs) {
    const st = d.delta_status || deltaState(s, d).status;
    counts[st] = (counts[st] || 0) + 1;
  }
  const cached = s.delta_cache.filter((c) => c.application_id === appId).length;
  return {
    rule_version: s.rule_version,
    total_documents: docs.length,
    auto_passed: counts["Auto-passed (unchanged)"],
    modified: counts["Modified — re-verified"],
    new_this_cycle: counts["New this cycle"],
    rechecked: counts["Re-checked (rules updated)"],
    cache_entries: cached,
  };
}

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
    .map((doc) => {
      const delta = deltaState(s, doc);
      return {
        ...doc,
        delta_status: doc.delta_status || delta.status,
        content_hash: delta.content_hash,
        extracted: jparse(doc.extracted, {}),
        source: jparse(doc.source, {}),
        forensic: jparse(doc.forensic, []),
      };
    });
  d.delta = deltaSummary(s, r.id);
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
