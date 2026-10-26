import type { Env } from "../shared";
import { actor, fail, guard, id, json, now } from "../shared";
import { applicationEnv } from "../database/client";
import { readable, mayAct } from "../casework/access";
interface DocumentEnv extends Env {
  FILES?: R2Bucket;
}
interface DocumentRow {
  id: string;
  case_id: string;
  uploaded_by: string;
  filename: string;
  content_type: string;
  bytes: number;
  sha256: string;
  object_key: string;
  status: string;
  is_demo: number;
  created_at: string;
}
const MiB = 1024 * 1024;
const key = (row: Pick<DocumentRow, "id" | "case_id" | "is_demo">) =>
  `${row.is_demo ? "demo" : "production"}/${encodeURIComponent(row.case_id)}/${row.id}`;
const columns =
  "d.id,d.case_id,d.uploaded_by,d.filename,d.content_type,d.bytes,d.created_at,o.name uploaded_name";
function mime(name: string, data: Uint8Array) {
  const ext = name.split(".").pop()?.toLowerCase(),
    prefix = String.fromCharCode(...data.slice(0, 8));
  if (ext === "pdf" && prefix.startsWith("%PDF-")) return "application/pdf";
  if (
    ext === "png" &&
    data[0] === 137 &&
    prefix.slice(1, 4) === "PNG" &&
    data[4] === 13 &&
    data[5] === 10 &&
    data[6] === 26 &&
    data[7] === 10
  )
    return "image/png";
  if (
    ["jpg", "jpeg"].includes(ext || "") &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  )
    return "image/jpeg";
  if (["docx", "xlsx"].includes(ext || "") && prefix.startsWith("PK\x03\x04"))
    return ext === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "txt") {
    try {
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data);
      if (data.includes(0)) throw new Error();
      return "text/plain; charset=utf-8";
    } catch {
      fail(400, "Text documents must contain valid UTF-8 text.");
    }
  }
  fail(
    400,
    "Choose a PDF, PNG, JPEG, DOCX, XLSX or UTF-8 text file matching its extension.",
  );
}
async function bytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Choose a document to upload.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > max) {
      await reader.cancel();
      fail(413, "The document exceeds the upload size limit.");
    }
    chunks.push(part.value);
  }
  if (!length) fail(400, "Empty files cannot be uploaded.");
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
export default {
  fetch(request: Request, originalEnv: DocumentEnv) {
    const env = applicationEnv(
      originalEnv,
      request.headers.get("x-db-generation"),
    ) as DocumentEnv;
    return guard(async () => {
      const user = actor(request, env),
        url = new URL(request.url);
      if (url.pathname === "/api/documents/config" && request.method === "GET")
        return json({
          available: !!env.FILES,
          max_file_bytes: user.is_demo ? 2 * MiB : 5 * MiB,
          max_files: 10,
          max_case_bytes: 20 * MiB,
        });
      const match = url.pathname.match(
        /^\/api\/cases\/([^/]+)\/documents(?:\/([a-f0-9-]{36}))?$/,
      );
      if (!match) fail(404, "Document route not found.");
      const caseId = decodeURIComponent(match[1]),
        documentId = match[2],
        c = await readable(env.DB, user, caseId);
      const canUpload =
        c.status !== "Disposed" &&
        c.intake !== "Rejected" &&
        ((await mayAct(env.DB, user, c)) ||
          c.created_by === user.id ||
          c.intake === "Approved");
      if (request.method === "GET" && !documentId) {
        const result = await env.DB.prepare(
          `SELECT ${columns} FROM case_documents d JOIN officials o ON o.id=d.uploaded_by WHERE d.case_id=? AND d.status='ready' ORDER BY d.created_at LIMIT 10`,
        )
          .bind(caseId)
          .all();
        return json({
          documents: result.results,
          available: !!env.FILES,
          can_upload: canUpload,
          max_file_bytes: user.is_demo ? 2 * MiB : 5 * MiB,
        });
      }
      if (!env.FILES)
        fail(
          503,
          "Document storage is not enabled. Ask IT to enable R2 Object Storage.",
        );
      if (documentId) {
        const row = await env.DB.prepare(
          "SELECT * FROM case_documents WHERE id=? AND case_id=? AND is_demo=?",
        )
          .bind(documentId, caseId, user.is_demo)
          .first<DocumentRow>();
        if (!row || row.status !== "ready" || row.object_key !== key(row))
          fail(404, "Document not found.");
        if (request.method === "GET") {
          const object = await env.FILES.get(key(row));
          if (!object) fail(404, "Document file unavailable.");
          return new Response(object.body, {
            headers: {
              "Content-Type": row.content_type,
              "Content-Length": String(row.bytes),
              "Content-Disposition": `attachment; filename="${row.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "sandbox; default-src 'none'",
            },
          });
        }
        if (request.method === "DELETE") {
          if (user.id !== row.uploaded_by && !(await mayAct(env.DB, user, c)))
            fail(
              403,
              "Only the uploader or case owner/manager can remove this document.",
            );
          if (!canUpload)
            fail(
              409,
              "Documents cannot be changed on a closed or rejected case.",
            );
          const changed = await env.DB.prepare(
            "UPDATE case_documents SET status='deleting' WHERE id=? AND status='ready'",
          )
            .bind(row.id)
            .run();
          if (!changed.meta.changes)
            fail(409, "Document status changed. Reload the case.");
          await env.FILES.delete(key(row));
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE case_documents SET status='deleted' WHERE id=? AND status='deleting'",
            ).bind(row.id),
            env.DB.prepare(
              "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) VALUES(?,?,'document_removed',?,?,?)",
            ).bind(
              id("event"),
              caseId,
              user.id,
              "Removed document: " + row.filename,
              now(),
            ),
          ]);
          return json({ ok: true });
        }
        fail(405, "Method not allowed.");
      }
      if (request.method !== "POST") fail(405, "Method not allowed.");
      if (!canUpload) fail(403, "Documents cannot be uploaded to this case.");
      const document = String(request.headers.get("x-upload-id") || "");
      if (!/^[a-f0-9-]{36}$/i.test(document))
        fail(400, "A valid upload identifier is required.");
      let filename = "";
      try {
        filename = decodeURIComponent(request.headers.get("x-file-name") || "")
          .normalize("NFC")
          .replace(/[\u0000-\u001f\u007f/\\]/g, "_");
      } catch {
        fail(400, "Invalid filename.");
      }
      if (!filename || filename.length > 180)
        fail(400, "Use a filename of 1–180 characters.");
      const max = user.is_demo ? 2 * MiB : 5 * MiB,
        declared = Number(request.headers.get("x-file-size"));
      if (!Number.isSafeInteger(declared) || declared < 1 || declared > max)
        fail(413, `Each document must be smaller than ${max / MiB} MB.`);
      const data = await bytes(request, max);
      if (data.length !== declared)
        fail(400, "The uploaded file size did not match. Retry the upload.");
      const contentType = mime(filename, data),
        hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const existing = await env.DB.prepare(
        "SELECT * FROM case_documents WHERE id=?",
      )
        .bind(document)
        .first<DocumentRow>();
      if (existing) {
        if (
          existing.case_id === caseId &&
          existing.uploaded_by === user.id &&
          existing.sha256 === hash &&
          existing.status === "ready"
        )
          return json({ ok: true, id: document });
        fail(
          409,
          "This document upload is already in progress. Retry after it completes.",
        );
      }
      const objectKey = key({
          id: document,
          case_id: caseId,
          is_demo: user.is_demo,
        }),
        stamp = now();
      const reserved = await env.DB.prepare(
        "INSERT INTO case_documents(id,case_id,uploaded_by,filename,content_type,bytes,sha256,object_key,status,is_demo,created_at) SELECT ?,?,?,?,?,?,?,?,'uploading',?,? WHERE (SELECT COUNT(*) FROM case_documents WHERE case_id=? AND status<>'deleted')<10 AND (SELECT COALESCE(SUM(bytes),0) FROM case_documents WHERE case_id=? AND status<>'deleted')+?<=? AND (?=0 OR (SELECT COALESCE(SUM(bytes),0) FROM case_documents WHERE is_demo=1 AND status<>'deleted')+?<=?) ON CONFLICT(id) DO NOTHING",
      )
        .bind(
          document,
          caseId,
          user.id,
          filename,
          contentType,
          data.length,
          hash,
          objectKey,
          user.is_demo,
          stamp,
          caseId,
          caseId,
          data.length,
          20 * MiB,
          user.is_demo,
          data.length,
          50 * MiB,
        )
        .run();
      if (!reserved.meta.changes)
        fail(
          409,
          "The case document limit or public-test storage limit has been reached.",
        );
      try {
        await env.FILES.put(objectKey, data, {
          httpMetadata: { contentType },
          customMetadata: {
            case_id: caseId,
            uploaded_by: user.id,
            sha256: hash,
          },
        });
        const current = await readable(env.DB, user, caseId);
        if (current.status === "Disposed" || current.intake === "Rejected")
          fail(409, "This case no longer accepts documents.");
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE case_documents SET status='ready' WHERE id=? AND status='uploading'",
          ).bind(document),
          env.DB.prepare(
            "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) VALUES(?,?,'document_added',?,?,?)",
          ).bind(
            id("event"),
            caseId,
            user.id,
            "Added document: " + filename,
            stamp,
          ),
        ]);
      } catch (error) {
        await env.FILES.delete(objectKey);
        try {
          await env.DB.prepare(
            "DELETE FROM case_documents WHERE id=? AND status='uploading'",
          )
            .bind(document)
            .run();
        } catch {
          /* Stale reservations are cleaned by the scheduled job. */
        }
        throw error;
      }
      return json({ ok: true, id: document }, 201);
    });
  },
  async scheduled(
    _controller: ScheduledController,
    originalEnv: DocumentEnv,
    ctx: ExecutionContext,
  ) {
    const env = applicationEnv(originalEnv) as DocumentEnv;
    ctx.waitUntil(
      (async () => {
        if (!env.FILES) return;
        const stale = await env.DB.prepare(
          "SELECT * FROM case_documents WHERE status IN('uploading','deleting') AND created_at<? LIMIT 20",
        )
          .bind(new Date(Date.now() - 3600000).toISOString())
          .all<DocumentRow>();
        for (const row of stale.results) {
          if (row.object_key !== key(row)) continue;
          await env.FILES.delete(key(row));
          await env.DB.prepare(
            "UPDATE case_documents SET status='deleted' WHERE id=? AND status IN('uploading','deleting')",
          )
            .bind(row.id)
            .run();
        }
      })(),
    );
  },
} satisfies ExportedHandler<DocumentEnv>;
