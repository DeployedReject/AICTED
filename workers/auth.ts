import type { Env } from "./shared";
import { fail, userColumns } from "./shared";
import type { Official } from "../packages/shared/types";
export const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export const sha = async (text: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: Uint8Array.from(salt.match(/../g) || [], (h) => parseInt(h, 16)),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
export function cookieToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("aicted_session="))
    ?.slice(15);
}
export async function session(
  request: Request,
  env: Env,
): Promise<Official & { portal: string }> {
  const token = cookieToken(request);
  if (!token || token.length > 150) fail(401, "Please sign in.");
  const db = token.startsWith("it.") ? env.CONTROL_DB || env.DB : env.DB;
  const user = await db
    .prepare(
      `SELECT ${userColumns
        .split(",")
        .map((c) => "u." + c)
        .join(
          ",",
        )},s.portal FROM sessions s JOIN officials u ON u.id=s.official_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
    )
    .bind(await sha(token), Math.floor(Date.now() / 1000))
    .first<Official & { portal: string }>();
  if (!user) fail(401, "Your session has expired. Please sign in again.");
  if (token.startsWith("it.") && user.role !== "it")
    fail(401, "Please sign in again.");
  if (user.role === "it" && env.CONTROL_DB && !token.startsWith("it."))
    fail(401, "Please sign in again.");
  if ((user.portal === "it") !== (user.role === "it"))
    fail(401, "Please sign in again.");
  return user;
}
