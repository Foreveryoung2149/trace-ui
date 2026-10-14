import { createHash, timingSafeEqual } from "node:crypto";
export function starterMode(value: string | undefined): "demo" | "sandbox" | "live" {
  const mode = value || "demo";
  if (!["demo", "sandbox", "live"].includes(mode)) throw new Error("Invalid TRACE_MODE");
  return mode as "demo" | "sandbox" | "live";
}
export function authorizedPreview(authorization: string | null, password: string | undefined): boolean {
  if (!password || password.length < 24 || !authorization?.startsWith("Basic ")) return false;
  const actual = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  return timingSafeEqual(createHash("sha256").update(actual).digest(), createHash("sha256").update(`trace:${password}`).digest());
}
