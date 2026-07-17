import { timingSafeEqual } from "node:crypto";

export function isAdminRequestAuthorized(provided: string | undefined, expected = process.env.ADMIN_API_KEY): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
