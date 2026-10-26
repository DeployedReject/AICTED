import type { Env } from "../shared";
import { body, fail, guard, json, userColumns } from "../shared";
import type { Official } from "../../packages/shared/types";

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const sha = async (text: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
async function passwordHash(password: string, salt: string) {
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
async function session(request: Request, env: Env): Promise<Official> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("aicted_session="))
    ?.slice(15);
  if (!token || token.length > 150) fail(401, "Please sign in.");
  const user = await env.DB.prepare(
    `SELECT ${userColumns
      .split(",")
      .map((c) => "u." + c)
      .join(
        ",",
      )} FROM sessions s JOIN officials u ON u.id=s.official_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
  )
    .bind(await sha(token), Math.floor(Date.now() / 1000))
    .first<Official>();
  if (!user) fail(401, "Your session has expired. Please sign in again.");
  return user;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return guard(async () => {
      if (
        request.method !== "GET" &&
        request.headers.get("origin") !== url.origin
      )
        fail(403, "Request origin is not allowed.");
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        if (
          env.AUTH_LIMITER &&
          !(
            await env.AUTH_LIMITER.limit({
              key: request.headers.get("cf-connecting-ip") || "local",
            })
          ).success
        )
          fail(429, "Too many attempts. Try again in a minute.");
        const input = await body(request);
        if (
          typeof input.id !== "string" ||
          typeof input.password !== "string" ||
          typeof input.designation !== "string" ||
          input.password.length > 256
        )
          fail(400, "Enter your ID, designation and password.");
        const user = await env.DB.prepare(
          `SELECT ${userColumns},password_hash,password_salt FROM officials WHERE id=? AND active=1`,
        )
          .bind(input.id.trim())
          .first<Official & { password_hash: string; password_salt: string }>();
        const expected = user?.password_hash;
        const actual = await passwordHash(
          input.password,
          user?.password_salt || "00000000000000000000000000000000",
        );
        if (
          !user ||
          !expected ||
          expected !== actual ||
          user.designation.toLowerCase() !== input.designation.toLowerCase()
        )
          fail(401, "The ID, designation or password is incorrect.");
        const token = crypto.randomUUID() + crypto.randomUUID();
        const expires = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM sessions WHERE official_id=? AND expires_at<?",
          ).bind(user.id, Math.floor(Date.now() / 1000)),
          env.DB.prepare(
            "INSERT INTO sessions(token_hash,official_id,expires_at) VALUES(?,?,?)",
          ).bind(await sha(token), user.id, expires),
        ]);
        const { password_hash: _hash, password_salt: _salt, ...safe } = user;
        return new Response(JSON.stringify({ user: safe }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": `aicted_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${url.protocol === "https:" ? "; Secure" : ""}`,
          },
        });
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const token = request.headers
          .get("cookie")
          ?.split(";")
          .map((p) => p.trim())
          .find((p) => p.startsWith("aicted_session="))
          ?.slice(15);
        if (token)
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
            .bind(await sha(token))
            .run();
        return new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": `aicted_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`,
          },
        });
      }
      let user = await session(request, env);
      if (url.pathname === "/api/auth/me") return json({ user });
      // The single public test login may preview only preconfigured demo personas.
      // This never changes the authenticated session or permits a real account.
      const sessionUserId = user.id;
      const previewId = request.headers.get("x-demo-actor");
      if (previewId && user.id === "0000" && user.is_demo === 1) {
        const preview = await env.DB.prepare(
          `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=1 AND active=1`,
        )
          .bind(previewId)
          .first<Official>();
        if (!preview)
          fail(403, "Only configured demo officials can be previewed.");
        user = preview;
      }
      if (
        request.method !== "GET" &&
        env.WRITE_LIMITER &&
        !(await env.WRITE_LIMITER.limit({ key: sessionUserId })).success
      )
        fail(429, "Please wait a minute before making more changes.");
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.set("x-internal-secret", env.INTERNAL_SECRET);
      headers.set("x-actor", JSON.stringify(user));
      return env.CASEWORK.fetch(new Request(request, { headers }));
    });
  },
} satisfies ExportedHandler<Env>;
