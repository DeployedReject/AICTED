import { useEffect, useState } from "react";
import type { CaseRecord } from "../../packages/shared/types";
import { driveFolder } from "../../packages/shared/drive";
import { api } from "./api";

export function FolderField({
  value,
  onChange,
  busy = false,
}: {
  value: string;
  onChange: (value: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="ws-file-selection">
      <label>
        Google Drive folder <span className="ws-hint">(optional)</span>
        <input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={busy}
          maxLength={1000}
          placeholder="https://drive.google.com/drive/folders/…"
        />
      </label>
      <details className="ws-admin-help">
        <summary>How to share documents</summary>
        <ol>
          <li>
            Create a folder in Google Drive and upload the case documents there.
          </li>
          <li>
            Open Share. Keep General access set to Restricted. Add the relevant
            Google accounts as Viewers, or Editors if they need to upload files.
          </li>
          <li>Copy the folder link and paste it here.</li>
        </ol>
        <p>
          Case permissions and Google Drive permissions are separate. When
          coordination is approved, the folder owner must also share it with the
          receiving officials. Remove their Drive access when it is no longer
          needed.
        </p>
        <p>
          Uploads and file changes happen in Drive and do not appear
          automatically in the case timeline. Leave a case comment when you add
          or change documents.
        </p>
        <a
          href="https://support.google.com/drive/answer/7166529"
          target="_blank"
          rel="noreferrer"
        >
          Google Drive sharing help ↗
        </a>
      </details>
    </div>
  );
}
interface Folder {
  drive_url: string;
  updated_at: string;
  updated_name: string;
}
export default function Documents({
  record,
  onChange,
}: {
  record: CaseRecord;
  onChange: () => void;
}) {
  const [data, setData] = useState<{
      folder: Folder | null;
      can_edit: boolean;
    } | null>(null),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ folder: Folder | null; can_edit: boolean }>(
      "/cases/" + encodeURIComponent(record.id) + "/documents/folder",
    )
      .then((result) => {
        if (active) {
          setData(result);
          setValue(result.folder?.drive_url || "");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  return (
    <section className="ws-card">
      <h2>Case documents</h2>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <div
          className="ws-skeleton"
          role="status"
          aria-label="Loading document folder"
        >
          <i />
          <i />
        </div>
      )}
      {data && (
        <>
          {data.folder ? (
            <div className="ws-folder-link">
              <a
                className="ws-primary"
                href={data.folder.drive_url}
                target="_blank"
                rel="noreferrer"
              >
                Open document folder ↗
              </a>
              <p className="ws-hint">
                Linked by {data.folder.updated_name} ·{" "}
                {new Date(data.folder.updated_at).toLocaleDateString("en-IN")}
              </p>
              <p>
                Open the folder to view or upload documents. If Google denies
                access, ask the folder owner to share it with your Google
                account.
              </p>
            </div>
          ) : (
            <p>No document folder linked.</p>
          )}
          {data.can_edit && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setError("");
                setBusy(true);
                try {
                  const url = driveFolder(value);
                  await api(
                    "/cases/" +
                      encodeURIComponent(record.id) +
                      "/documents/folder",
                    { url },
                  );
                  onChange();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FolderField value={value} onChange={setValue} busy={busy} />
              <button
                className="ws-primary"
                disabled={busy || value === (data.folder?.drive_url || "")}
              >
                {busy
                  ? "Saving link…"
                  : !value.trim() && data.folder
                    ? "Remove folder link"
                    : "Save folder link"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
