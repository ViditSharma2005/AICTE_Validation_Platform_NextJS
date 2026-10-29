/* Stateless bearer tokens (HMAC-signed), so login works on serverless
   hosts without a sessions table. Password check mirrors the portal
   account records; use a real identity provider in production. */
import crypto from "node:crypto";
import { getStore, userById } from "./store.js";

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

const secret = () => process.env.AUTH_SECRET || "dev-only-secret-change-me";
const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signToken(userId, epoch) {
  const payload = b64url(JSON.stringify({ uid: userId, ep: epoch, exp: Date.now() + 7 * 864e5 }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `v1.${payload}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [v, payload, sig] = String(token).split(".");
    if (v !== "v1" || !payload || !sig) return null;
    const expect = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.uid || data.exp < Date.now()) return null;
    if (data.ep !== getStore().epoch) return null; // dataset was reset
    return userById(getStore(), data.uid);
  } catch {
    return null;
  }
}

export function currentUser(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const user = token ? verifyToken(token) : null;
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, `This action needs one of these roles: ${roles.join(", ")}`);
  }
}

export function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

export function canSee(user, application) {
  if (user.role.startsWith("College")) return application.institution_id === user.institution_id;
  return true;
}

export function getApplicationOr404(s, appId, user) {
  const r = s.applications.find((a) => a.id === appId);
  if (!r || !canSee(user, r)) throw new HttpError(404, "Application not found");
  return r;
}
