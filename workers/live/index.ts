import type { Env } from "../shared";
import type { Official } from "../../packages/shared/types";
import { actor, fail, guard, json } from "../shared";
import { applicationEnv } from "../database/client";
interface LiveEnv extends Env {
  ROOM: DurableObjectNamespace;
}
export class LiveRoom {
  constructor(
    private ctx: DurableObjectState,
    private original: LiveEnv,
  ) {}
  async fetch(request: Request) {
    return guard(async () => {
      const user = actor(request, this.original),
        url = new URL(request.url);
      if (url.pathname === "/open") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          fail(426, "A WebSocket connection is required.");
        const existing = this.ctx.getWebSockets().filter((socket) => {
          try {
            return socket.deserializeAttachment()?.id === user.id;
          } catch {
            return false;
          }
        });
        if (existing.length >= 4)
          existing[0].close(1000, "A newer portal connection opened.");
        const pair = new WebSocketPair(),
          client = pair[0],
          server = pair[1];
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
          id: user.id,
          role: user.role,
          institution_id: user.institution_id || "",
          is_demo: user.is_demo,
          client: request.headers.get("x-portal-client") || "",
        });
        return new Response(null, { status: 101, webSocket: client });
      }
      if (url.pathname !== "/change" || request.method !== "POST")
        fail(404, "Live route not found.");
      const input = (await request.json()) as {
        path: string;
        id?: string;
        client?: string;
        previous?: string;
      };
      const path = String(input.path || "");
      const global = path.startsWith("/api/admin") || path === "/api/database",
        ids = new Set<string>([user.id]);
      let institutionId = "",
        caseId = "";
      if (input.previous) ids.add(input.previous);
      const match = path.match(/^\/api\/(?:institution\/)?cases\/([^/]+)/);
      if (match) caseId = decodeURIComponent(match[1]);
      else if (path === "/api/cases" || path === "/api/institution/cases")
        caseId = String(input.id || "");
      const env = applicationEnv(this.original);
      if (path.startsWith("/api/handoffs/") || path.endsWith("/handoff")) {
        if (!caseId) {
          const row = await env.DB.prepare(
            "SELECT case_id FROM handoff_requests WHERE id=?",
          )
            .bind(path.split("/").pop())
            .first<{ case_id: string }>();
          caseId = row?.case_id || "";
        }
        if (caseId) {
          const targets = await env.DB.prepare(
            "SELECT h.target_id,o.manager_id FROM handoff_requests h JOIN officials o ON o.id=h.target_id WHERE h.case_id=? ORDER BY h.created_at DESC LIMIT 1",
          )
            .bind(caseId)
            .all<{ target_id: string; manager_id: string | null }>();
          for (const target of targets.results) {
            ids.add(target.target_id);
            if (target.manager_id) ids.add(target.manager_id);
          }
        }
      }
      if (caseId) {
        const rows = await env.DB.prepare(
          "WITH RECURSIVE owners(id) AS(SELECT assigned_to FROM cases WHERE id=? UNION SELECT created_by FROM cases WHERE id=? UNION SELECT official_id FROM case_grants WHERE case_id=? AND revoked_at IS NULL UNION SELECT o.manager_id FROM officials o JOIN owners p ON o.id=p.id WHERE o.manager_id IS NOT NULL) SELECT id FROM owners",
        )
          .bind(caseId, caseId, caseId)
          .all<{ id: string }>();
        rows.results.forEach((row) => ids.add(row.id));
        if (
          path.startsWith("/api/institution/") ||
          (!path.endsWith("/coordination") &&
            !path.endsWith("/relations") &&
            !path.endsWith("/handoff"))
        ) {
          const c = await env.DB.prepare(
            "SELECT institution_id,institution_account_id,(SELECT is_public FROM case_events e WHERE e.case_id=c.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1) public_update,(SELECT is_public FROM case_folders f WHERE f.case_id=c.id) public_folder FROM cases c WHERE c.id=? AND c.is_demo=?",
          )
            .bind(caseId, user.is_demo)
            .first<{
              institution_id: string;
              institution_account_id: string | null;
              public_update: number;
              public_folder: number;
            }>();
          if (
            c?.institution_account_id &&
            (!path.endsWith("/comments") || c.public_update === 1) &&
            (!path.endsWith("/documents/folder") || c.public_folder === 1)
          )
            institutionId = c.institution_id;
        }
      }
      if (path === "/api/messages" && input.id) {
        const row = await env.DB.prepare(
          "SELECT sender_id,recipient_id FROM messages WHERE id=? AND is_demo=?",
        )
          .bind(input.id, user.is_demo)
          .first<{ sender_id: string; recipient_id: string }>();
        if (row) {
          ids.add(row.sender_id);
          ids.add(row.recipient_id);
        }
      }
      for (const socket of this.ctx.getWebSockets()) {
        try {
          const peer = socket.deserializeAttachment() as Official & {
            client?: string;
          };
          if (
            peer.is_demo !== user.is_demo ||
            (input.client && peer.client === input.client)
          )
            continue;
          if (
            global ||
            (peer.role === "institution"
              ? peer.institution_id === institutionId
              : ids.has(peer.id))
          )
            socket.send(JSON.stringify({ type: "changed" }));
        } catch {
          try {
            socket.close(1011, "Reconnect to refresh.");
          } catch {}
        }
      }
      return json({ ok: true });
    });
  }
  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "This connection receives updates only.");
  }
  webSocketClose(socket: WebSocket) {
    try {
      socket.close();
    } catch {}
  }
}
export default {
  fetch(request: Request, env: LiveEnv) {
    return guard(async () => {
      const user = actor(request, env);
      return env.ROOM.get(env.ROOM.idFromName(String(user.is_demo))).fetch(
        request,
      );
    });
  },
} satisfies ExportedHandler<LiveEnv>;
