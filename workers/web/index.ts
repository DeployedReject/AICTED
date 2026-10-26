import { designationMatches } from "../../packages/shared/designations";
import { applicationEnv } from "../database/client";
import type { Env } from "../shared";
import { body, fail, guard, json, userColumns } from "../shared";
import type { Official } from "../../packages/shared/types";

import { session, sha, passwordHash } from "../auth";
import { HttpError } from "../shared";
import { identity } from "./identity";
import { runtime } from "../runtime";
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    env = applicationEnv(env);
    const url = new URL(request.url);
    const protectedPage =
      /^\/(?:workspace|institution\/workspace|it\/(?:workspace|setup))(?:\/|$)/.test(
        url.pathname,
      );
    if (protectedPage) {
      try {
        const user = await session(request, env);
        const home =
          user.role === "it"
            ? "/it/workspace"
            : user.role === "institution"
              ? "/institution/workspace"
              : "/workspace";
        if (!url.pathname.startsWith(home))
          return Response.redirect(new URL(home, url).toString(), 302);
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "private, no-store");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          return Response.redirect(
            new URL(
              url.pathname.startsWith("/it/")
                ? "/it"
                : url.pathname.startsWith("/institution/")
                  ? "/?portal=institution"
                  : "/",
              url,
            ).toString(),
            302,
          );
        return json({ error: "Sign-in is temporarily unavailable." }, 503);
      }
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    let changeUser: Official | undefined;
    let previousAssignee = "";
    const response = await guard(async () => {
      if (
        request.method !== "GET" &&
        request.headers.get("origin") !== url.origin
      )
        fail(403, "Request origin is not allowed.");
      const fixed = { ...env, DB: env.CONTROL_DB || env.DB };
      const publicAction = await identity(
        request,
        url.pathname.startsWith("/api/auth/setup") ? fixed : env,
      );
      if (publicAction) return publicAction;
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
        if (input.portal === "institution") {
          if (!env.INSTITUTIONS)
            fail(503, "Institution sign-in is unavailable.");
          return env.INSTITUTIONS.fetch(
            new Request("https://private/api/institution/login", {
              method: "POST",
              headers: {
                "x-internal-secret": env.INTERNAL_SECRET,
                "x-forwarded-proto": url.protocol.slice(0, -1),
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
            }),
          );
        }
        const portal = input.portal === "it" ? "it" : "official";
        if (
          typeof input.id !== "string" ||
          typeof input.password !== "string" ||
          (portal === "official" && typeof input.designation !== "string") ||
          input.password.length > 256
        )
          fail(
            400,
            portal === "it"
              ? "Enter your ID and password."
              : "Enter your ID, designation and password.",
          );
        const loginDb = portal === "it" ? fixed.DB : env.DB;
        const user = await loginDb
          .prepare(
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
          (portal === "official" &&
            !designationMatches(user.designation, String(input.designation)))
        )
          fail(
            401,
            portal === "it"
              ? "The ID or password is incorrect."
              : "The ID, designation or password is incorrect.",
          );
        if (
          portal === "it" &&
          user.role !== "it" &&
          !(user.id === "0000" && user.is_demo === 1)
        )
          fail(403, "Use the official sign-in.");
        if (portal === "official" && user.role === "it")
          fail(403, "Use the IT sign-in.");
        let sessionId = user.id;
        if (portal === "it" && user.id === "0000" && user.is_demo === 1) {
          const demoIT = await loginDb
            .prepare(
              "SELECT id FROM officials WHERE id='DEMO-IT' AND role='it' AND is_demo=1 AND active=1",
            )
            .first<{ id: string }>();
          if (!demoIT) fail(403, "The demo IT account is unavailable.");
          sessionId = demoIT.id;
        }
        const token =
          (portal === "it" ? "it." : "") +
          crypto.randomUUID() +
          crypto.randomUUID();
        const cfg = await runtime(portal === "it" ? fixed : env, user.is_demo);
        const seconds = cfg.session_hours * 3600;
        const expires = Math.floor(Date.now() / 1000) + seconds;
        await loginDb.batch([
          loginDb
            .prepare(
              "DELETE FROM sessions WHERE official_id=? AND expires_at<?",
            )
            .bind(user.id, Math.floor(Date.now() / 1000)),
          loginDb
            .prepare(
              "INSERT INTO sessions(token_hash,official_id,expires_at,portal) VALUES(?,?,?,?)",
            )
            .bind(await sha(token), sessionId, expires, portal),
        ]);
        const { password_hash: _hash, password_salt: _salt, ...safe } = user;
        return new Response(JSON.stringify({ user: safe }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": `aicted_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${url.protocol === "https:" ? "; Secure" : ""}`,
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
          await (token.startsWith("it.") ? fixed.DB : env.DB)
            .prepare(
              token.startsWith("institution.")
                ? "DELETE FROM institution_sessions WHERE token_hash=?"
                : "DELETE FROM sessions WHERE token_hash=?",
            )
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
      changeUser = user;
      if (
        request.method === "POST" &&
        /^\/api\/cases\/[^/]+\/action$/.test(url.pathname)
      ) {
        const row = await env.DB.prepare(
          "SELECT assigned_to FROM cases WHERE id=? AND is_demo=?",
        )
          .bind(decodeURIComponent(url.pathname.split("/")[3]), user.is_demo)
          .first<{ assigned_to: string }>();
        previousAssignee = row?.assigned_to || "";
      }
      if (url.pathname === "/api/live") {
        if (!env.LIVE) fail(503, "Live updates are unavailable.");
        if (request.headers.get("Origin") !== url.origin)
          fail(403, "Live connection origin is not allowed.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        headers.set(
          "x-portal-client",
          (url.searchParams.get("client") || "").slice(0, 100),
        );
        return env.LIVE.fetch(new Request("https://live/open", { headers }));
      }

      if (
        /^\/api\/admin\/institution-(records|accounts|routing)$/.test(
          url.pathname,
        )
      ) {
        if (user.role !== "it") fail(403, "Administration access is required.");
        if (!env.INSTITUTIONS)
          fail(503, "Institution administration is unavailable.");
        if (
          request.method !== "GET" &&
          env.WRITE_LIMITER &&
          !(await env.WRITE_LIMITER.limit({ key: user.id })).success
        )
          fail(429, "Please wait before making more changes.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        headers.delete("x-db-generation");
        if (env.DB_GENERATION?.value)
          headers.set("x-db-generation", env.DB_GENERATION.value);
        return env.INSTITUTIONS.fetch(new Request(request, { headers }));
      }
      if (user.role === "institution") {
        if (url.pathname === "/api/auth/me") return json({ user });
        if (!url.pathname.startsWith("/api/institution/"))
          fail(403, "Use the institution portal.");
        if (!env.INSTITUTIONS) fail(503, "Institution service is unavailable.");
        if (
          request.method !== "GET" &&
          env.WRITE_LIMITER &&
          !(await env.WRITE_LIMITER.limit({ key: user.id })).success
        )
          fail(429, "Please wait before making more changes.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        headers.delete("x-db-generation");
        if (env.DB_GENERATION?.value)
          headers.set("x-db-generation", env.DB_GENERATION.value);
        return env.INSTITUTIONS.fetch(new Request(request, { headers }));
      }
      if (url.pathname.startsWith("/api/institution/"))
        fail(403, "Institution access is required.");
      if (
        /^\/api\/handoffs(?:\/[^/]+)?$/.test(url.pathname) ||
        /^\/api\/cases\/[^/]+\/handoff$/.test(url.pathname)
      ) {
        if (!env.HANDOFFS) fail(503, "Handoff service is unavailable.");
        if (user.role !== "manager") fail(403, "Manager access is required.");
        if (
          request.method !== "GET" &&
          env.WRITE_LIMITER &&
          !(await env.WRITE_LIMITER.limit({ key: user.id })).success
        )
          fail(429, "Please wait before making more changes.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        headers.delete("x-db-generation");
        if (env.DB_GENERATION?.value)
          headers.set("x-db-generation", env.DB_GENERATION.value);
        return env.HANDOFFS.fetch(new Request(request, { headers }));
      }
      if (
        url.pathname === "/api/reports" ||
        url.pathname === "/api/reports/export"
      ) {
        if (!env.REPORTS) fail(503, "Reports are unavailable.");
        if (
          url.pathname.endsWith("/export") &&
          env.WRITE_LIMITER &&
          !(await env.WRITE_LIMITER.limit({ key: "export:" + user.id })).success
        )
          fail(429, "Please wait before exporting another report.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        headers.delete("x-db-generation");
        if (env.DB_GENERATION?.value)
          headers.set("x-db-generation", env.DB_GENERATION.value);
        return env.REPORTS.fetch(new Request(request, { headers }));
      }
      if (url.pathname === "/api/database") {
        if (user.role !== "it") fail(403, "IT access is required.");
        if (!env.DATABASE) fail(503, "Database routing is not configured.");
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.set("x-internal-secret", env.INTERNAL_SECRET);
        headers.set("x-actor", JSON.stringify(user));
        return env.DATABASE.fetch(
          new Request("https://database/manage", {
            method: request.method,
            headers,
            body: request.method === "GET" ? undefined : request.body,
          }),
        );
      }
      const sessionUserId = user.id;
      if (url.pathname === "/api/auth/me") return json({ user });
      if (
        request.method !== "GET" &&
        env.WRITE_LIMITER &&
        !(await env.WRITE_LIMITER.limit({ key: sessionUserId })).success
      )
        fail(429, "Please wait a minute before making more changes.");
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.delete("x-demo-actor");
      headers.set("x-internal-secret", env.INTERNAL_SECRET);
      headers.set("x-actor", JSON.stringify(user));
      headers.delete("x-db-generation");
      if (env.DB_GENERATION?.value)
        headers.set("x-db-generation", env.DB_GENERATION.value);
      const noticesRequest = url.pathname === "/api/notices";
      if (noticesRequest && !env.NOTIFICATIONS)
        fail(503, "Notifications are unavailable.");
      const documentsRequest = /^\/api\/cases\/[^/]+\/documents\/folder$/.test(
        url.pathname,
      );
      if (documentsRequest && !env.DOCUMENTS)
        fail(503, "Document storage is not configured.");
      const service = noticesRequest
        ? env.NOTIFICATIONS!
        : documentsRequest
          ? env.DOCUMENTS!
          : env.CASEWORK;
      const response = await service.fetch(new Request(request, { headers }));
      if (
        !user.is_demo &&
        request.method === "POST" &&
        response.ok &&
        env.NOTIFICATIONS
      )
        ctx.waitUntil(
          env.NOTIFICATIONS.fetch(
            new Request("https://private/dispatch", {
              method: "POST",
              headers: {
                "x-internal-secret": env.INTERNAL_SECRET,
                "x-actor": JSON.stringify(user),
                ...(env.DB_GENERATION?.value
                  ? { "x-db-generation": env.DB_GENERATION.value }
                  : {}),
                "Content-Type": "application/json",
              },
              body: "{}",
            }),
          )
            .then(() => {})
            .catch(() => {
              console.error("Notification dispatch unavailable.");
            }),
        );
      return response;
    });
    if (changeUser && env.LIVE && response.ok && request.method === "POST") {
      const publisher = changeUser;
      ctx.waitUntil(
        (async () => {
          let id = "";
          try {
            id = String(
              ((await response.clone().json()) as { id?: string }).id || "",
            );
          } catch {}
          try {
            await env.LIVE!.fetch(
              new Request("https://live/change", {
                method: "POST",
                headers: {
                  "x-internal-secret": env.INTERNAL_SECRET,
                  "x-actor": JSON.stringify(publisher),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  path: url.pathname,
                  id,
                  previous: previousAssignee,
                  client: (request.headers.get("x-portal-client") || "").slice(
                    0,
                    100,
                  ),
                }),
              }),
            );
          } catch (error) {
            console.error(
              "Live update delivery failed",
              error instanceof Error ? error.message : "unknown",
            );
          }
        })(),
      );
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
