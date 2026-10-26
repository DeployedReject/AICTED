import { useEffect, useRef, useState } from "react";
import type { CaseRecord, Official } from "../../packages/shared/types";
import { api } from "./api";
import OfficialPicker from "./OfficialPicker";
export default function AssignCase({
  record,
  officials,
  cancel,
  done,
}: {
  record: CaseRecord;
  officials: Official[];
  cancel: () => void;
  done: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="ws-assignment-dialog"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) cancel();
      }}
      aria-labelledby="assign-case-title"
    >
      <h2 id="assign-case-title">Assign case</h2>
      <p>
        {record.subject}
        <small>
          {record.id} · Currently assigned to {record.assigned_name}
        </small>
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api("/cases/" + encodeURIComponent(record.id) + "/action", {
              action: "assign",
              official_id: form.get("official_id"),
              reason: form.get("reason"),
            });
            done();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <OfficialPicker
          name="official_id"
          label="Team member"
          kind="team"
          officials={officials}
          bureau={record.bureau}
          excludeId={record.assigned_to}
          required
        />
        <label>
          Assignment note
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
          />
        </label>
        {error && (
          <p role="alert" className="ws-error">
            {error}
          </p>
        )}
        <div className="ws-form-actions">
          <button type="submit" className="ws-primary" disabled={busy}>
            {busy ? "Assigning case…" : "Assign case"}
          </button>
          <button type="button" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
