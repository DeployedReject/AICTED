import { driveFolder } from "../../packages/shared/drive";
import type { Env } from "../shared";
import { actor, body, fail, guard, id, json, now } from "../shared";
import { applicationEnv } from "../database/client";
import { readable, mayAct } from "../casework/access";

export default {
  fetch(request: Request, originalEnv: Env) {
    const env = applicationEnv(
      originalEnv,
      request.headers.get("x-db-generation"),
    );
    return guard(async () => {
      const user = actor(request, env),
        url = new URL(request.url);
      const match = url.pathname.match(
        /^\/api\/cases\/([^/]+)\/documents\/folder$/,
      );
      if (!match) fail(404, "Document route not found.");
      const caseId = decodeURIComponent(match[1]),
        c = await readable(env.DB, user, caseId);
      const canEdit =
        c.status !== "Disposed" &&
        c.intake !== "Rejected" &&
        ((await mayAct(env.DB, user, c)) || c.created_by === user.id);
      if (request.method === "GET") {
        const folder = await env.DB.prepare(
          "SELECT f.drive_url,f.updated_at,f.is_public,o.name updated_name FROM case_folders f JOIN officials o ON o.id=f.updated_by WHERE f.case_id=?",
        )
          .bind(caseId)
          .first();
        return json({ folder, can_edit: canEdit });
      }
      if (request.method !== "POST") fail(405, "Method not allowed.");
      if (!canEdit)
        fail(
          403,
          "Only the case submitter, assigned official or their manager can change the folder link on an open case.",
        );
      const input = await body(request);
      if (typeof input.url !== "string" || input.url.length > 1000)
        fail(400, "Paste a Google Drive folder link.");
      let folderUrl = "";
      try {
        folderUrl = driveFolder(input.url);
      } catch (error) {
        fail(400, (error as Error).message);
      }
      const existing = await env.DB.prepare(
        "SELECT drive_url,is_public FROM case_folders WHERE case_id=?",
      )
        .bind(caseId)
        .first<{ drive_url: string; is_public: number }>();
      const publicFolder =
        input.is_public === true || input.is_public === "1" ? 1 : 0;
      if (
        (existing?.drive_url || "") === folderUrl &&
        (existing?.is_public || 0) === publicFolder
      )
        return json({ ok: true });
      const stamp = now();
      await env.DB.batch([
        folderUrl
          ? env.DB.prepare(
              "INSERT INTO case_folders(case_id,drive_url,updated_by,updated_at,is_public) VALUES(?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET drive_url=excluded.drive_url,updated_by=excluded.updated_by,updated_at=excluded.updated_at,is_public=excluded.is_public",
            ).bind(caseId, folderUrl, user.id, stamp, publicFolder)
          : env.DB.prepare("DELETE FROM case_folders WHERE case_id=?").bind(
              caseId,
            ),
        env.DB.prepare(
          "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) VALUES(?,?,'document_folder',?,?,?)",
        ).bind(
          id("event"),
          caseId,
          user.id,
          folderUrl
            ? existing
              ? "Replaced Google Drive document folder."
              : "Linked Google Drive document folder."
            : "Removed Google Drive document folder link.",
          stamp,
        ),
      ]);
      return json({ ok: true });
    });
  },
} satisfies ExportedHandler<Env>;
