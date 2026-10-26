import { useEffect, useRef, useState } from "react";
import type { CaseRecord } from "../../packages/shared/types";
import { api } from "./api";
const MiB = 1024 * 1024;
export interface UploadItem {
  id: string;
  file: File;
  status: "selected" | "uploading" | "complete" | "failed";
  progress: number;
}
export interface StorageConfig {
  available: boolean;
  max_file_bytes: number;
}
export function useUploads(
  maxBytes: number,
  existingCount = 0,
  existingBytes = 0,
) {
  const [files, setFiles] = useState<UploadItem[]>([]),
    [error, setError] = useState("");
  function choose(input: FileList | null) {
    if (!input) return;
    setError("");
    const incoming = [...input];
    if (incoming.length + files.length + existingCount > 10) {
      setError("A case can have up to 10 documents.");
      return;
    }
    if (incoming.some((file) => !file.size || file.size > maxBytes)) {
      setError(
        `Choose non-empty documents smaller than ${maxBytes / MiB} MB each.`,
      );
      return;
    }
    if (
      incoming.some(
        (file) => !/\.(pdf|png|jpe?g|docx|xlsx|txt)$/i.test(file.name),
      )
    ) {
      setError("Choose PDF, PNG, JPEG, DOCX, XLSX or text documents.");
      return;
    }
    if (
      existingBytes +
        files.reduce((sum, item) => sum + item.file.size, 0) +
        incoming.reduce((sum, file) => sum + file.size, 0) >
      20 * MiB
    ) {
      setError("Documents for one case can total up to 20 MB.");
      return;
    }
    setFiles((previous) => [
      ...previous,
      ...incoming.map((file) => ({
        file,
        id: crypto.randomUUID(),
        status: "selected" as const,
        progress: 0,
      })),
    ]);
  }
  function update(id: string, patch: Partial<UploadItem>) {
    setFiles((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  async function upload(caseId: string) {
    setError("");
    for (const item of files) {
      if (item.status === "complete") continue;
      update(item.id, { status: "uploading", progress: 0 });
      try {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open(
            "POST",
            "/api/cases/" + encodeURIComponent(caseId) + "/documents",
          );
          request.withCredentials = true;
          request.timeout = 60000;
          request.setRequestHeader(
            "Content-Type",
            item.file.type || "application/octet-stream",
          );
          request.setRequestHeader(
            "x-file-name",
            encodeURIComponent(item.file.name),
          );
          request.setRequestHeader("x-file-size", String(item.file.size));
          request.setRequestHeader("x-upload-id", item.id);
          request.upload.onprogress = (event) => {
            if (event.lengthComputable)
              update(item.id, {
                progress: Math.min(
                  95,
                  Math.round((event.loaded / event.total) * 100),
                ),
              });
          };
          request.onload = () => {
            let result: { error?: string } = {};
            try {
              result = JSON.parse(request.responseText);
            } catch {
              /* Keep a useful message for a disconnected response. */
            }
            if (request.status >= 200 && request.status < 300) resolve();
            else
              reject(
                new Error(
                  result.error || "Upload failed. Retry this document.",
                ),
              );
          };
          request.onerror = () =>
            reject(
              new Error("The connection was interrupted. Retry the upload."),
            );
          request.ontimeout = () =>
            reject(new Error("Upload timed out. Retry the upload."));
          request.send(item.file);
        });
        update(item.id, { status: "complete", progress: 100 });
      } catch (error) {
        update(item.id, { status: "failed" });
        setError(item.file.name + ": " + (error as Error).message);
        throw error;
      }
    }
  }
  return {
    files,
    error,
    choose,
    upload,
    remove: (id: string) =>
      setFiles((previous) => previous.filter((item) => item.id !== id)),
    clear: () => setFiles([]),
  };
}
export function FileSelection({
  uploads,
  available,
  maxBytes,
  busy,
}: {
  uploads: ReturnType<typeof useUploads>;
  available: boolean;
  maxBytes: number;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="ws-file-selection">
      <label>
        Supporting documents
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
          disabled={busy || !available}
          onChange={(event) => {
            uploads.choose(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <p className="ws-description">
        {available
          ? `PDF, PNG, JPEG, DOCX, XLSX or text. Up to ${maxBytes / MiB} MB per file and 20 MB per case.`
          : "Document uploads are unavailable until IT enables document storage."}
      </p>
      {uploads.error && (
        <p className="ws-error" role="alert">
          {uploads.error}
        </p>
      )}
      <ul className="ws-upload-list">
        {uploads.files.map((item) => (
          <li key={item.id}>
            <div>
              <b>{item.file.name}</b>
              <small>
                {(item.file.size / MiB).toFixed(2)} MB ·{" "}
                {item.status === "complete"
                  ? "Uploaded"
                  : item.status === "failed"
                    ? "Upload failed"
                    : item.status === "uploading"
                      ? `Uploading ${item.progress}%`
                      : "Ready to upload"}
              </small>
            </div>
            {item.status !== "complete" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => uploads.remove(item.id)}
                aria-label={"Remove " + item.file.name}
              >
                Remove file
              </button>
            )}
            {item.status === "uploading" && (
              <progress
                value={item.progress}
                max={100}
                aria-label={"Uploading " + item.file.name}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
interface Document {
  id: string;
  filename: string;
  bytes: number;
  created_at: string;
  uploaded_by: string;
  uploaded_name: string;
}
interface DocumentList extends StorageConfig {
  documents: Document[];
  can_upload: boolean;
}
export default function Documents({
  record,
  userId,
  onChange,
}: {
  record: CaseRecord;
  userId: string;
  onChange: () => void;
}) {
  const [data, setData] = useState<DocumentList | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const uploads = useUploads(
    data?.max_file_bytes || 5 * MiB,
    data?.documents.length || 0,
    data?.documents.reduce((sum, item) => sum + item.bytes, 0) || 0,
  );
  async function load() {
    try {
      setData(
        await api<DocumentList>(
          "/cases/" + encodeURIComponent(record.id) + "/documents",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [record.id]);
  async function remove(document: Document) {
    if (!confirm("Remove " + document.filename + " from this case?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/cases/" +
          encodeURIComponent(record.id) +
          "/documents/" +
          document.id,
        { method: "DELETE", credentials: "same-origin" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not remove document.");
      await load();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-card">
      <h2>Supporting documents</h2>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {!data && !error ? (
        <div
          className="ws-skeleton"
          role="status"
          aria-label="Loading documents"
        >
          <i />
          <i />
        </div>
      ) : (
        data && (
          <>
            <ul className="ws-document-list">
              {data.documents.map((document) => (
                <li key={document.id}>
                  <div>
                    <a
                      href={
                        "/api/cases/" +
                        encodeURIComponent(record.id) +
                        "/documents/" +
                        document.id
                      }
                    >
                      {document.filename}
                    </a>
                    <small>
                      {(document.bytes / MiB).toFixed(2)} MB ·{" "}
                      {document.uploaded_name} ·{" "}
                      {new Date(document.created_at).toLocaleDateString(
                        "en-IN",
                      )}
                    </small>
                  </div>
                  {data.can_upload &&
                    (record.can_act || document.uploaded_by === userId) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(document)}
                      >
                        Remove document
                      </button>
                    )}
                </li>
              ))}
            </ul>
            {!data.documents.length && <p>No documents attached.</p>}
            {data.can_upload && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await uploads.upload(record.id);
                    uploads.clear();
                    await load();
                    onChange();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <FileSelection
                  uploads={uploads}
                  available={data.available}
                  maxBytes={data.max_file_bytes}
                  busy={busy}
                />
                <button
                  className="ws-primary"
                  disabled={busy || !data.available || !uploads.files.length}
                >
                  {busy ? "Uploading documents…" : "Upload documents"}
                </button>
              </form>
            )}
          </>
        )
      )}
    </section>
  );
}
