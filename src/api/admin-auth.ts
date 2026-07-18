import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "shop_agent_admin";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

const safeEqual = (left: string | undefined, right: string | undefined): boolean => {
  if (!left || !right) return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const configuredAdminPassword = () => process.env.ADMIN_PASSWORD ?? process.env.ADMIN_API_KEY;
const signingSecret = () => process.env.ADMIN_SESSION_SECRET ?? configuredAdminPassword();
const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function verifyAdminPassword(provided: string | undefined, expected = configuredAdminPassword()): boolean {
  return safeEqual(provided, expected);
}

export function createAdminSession(now = Date.now(), secret = signingSecret()): string | undefined {
  if (!secret) return undefined;
  const payload = Buffer.from(JSON.stringify({ expiresAt: now + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyAdminSession(token: string | undefined, now = Date.now(), secret = signingSecret()): boolean {
  if (!token || !secret) return false;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra || !safeEqual(providedSignature, signature(payload, secret))) return false;
  try { return Number((JSON.parse(Buffer.from(payload, "base64url").toString()) as { expiresAt?: unknown }).expiresAt) > now; }
  catch { return false; }
}

export function sessionFromCookie(cookieHeader: string | undefined): string | undefined {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

export function isAdminRequestAuthorized(providedKey: string | undefined, cookieHeader?: string): boolean {
  return verifyAdminPassword(providedKey) || verifyAdminSession(sessionFromCookie(cookieHeader));
}

export const adminSessionCookie = (token: string) => `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
export const expiredAdminSessionCookie = () => `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
