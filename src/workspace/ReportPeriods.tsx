import ReportPanel from "./ReportPanel";
interface Row {
  received_at: string;
  disposed_at?: string | null;
  intake: string;
  status: string;
}
export default function ReportPeriods({ rows }: { rows: Row[] }) {
  const now = new Date(),
    monthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months = Array.from({ length: 6 }, (_, i) => {
    const index = monthIndex - 5 + i,
      start = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1)),
      end = new Date(
        Date.UTC(Math.floor((index + 1) / 12), (index + 1) % 12, 1),
      );
    return {
      label: start.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      received: rows.filter(
        (r) =>
          Date.parse(r.received_at) >= +start &&
          Date.parse(r.received_at) < +end,
      ).length,
      disposed: rows.filter(
        (r) =>
          r.disposed_at &&
          Date.parse(r.disposed_at) >= +start &&
          Date.parse(r.disposed_at) < +end,
      ).length,
    };
  });
  const qIndex = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3),
    quarters = Array.from({ length: 4 }, (_, i) => {
      const index = qIndex - 3 + i,
        start = new Date(Date.UTC(Math.floor(index / 4), (index % 4) * 3, 1)),
        end = new Date(
          Date.UTC(Math.floor((index + 1) / 4), ((index + 1) % 4) * 3, 1),
        );
      return {
        label: `Q${(index % 4) + 1} ${Math.floor(index / 4)}`,
        received: rows.filter(
          (r) =>
            Date.parse(r.received_at) >= +start &&
            Date.parse(r.received_at) < +end,
        ).length,
        disposed: rows.filter(
          (r) =>
            r.disposed_at &&
            Date.parse(r.disposed_at) >= +start &&
            Date.parse(r.disposed_at) < +end,
        ).length,
      };
    });
  const max = Math.max(1, ...months.flatMap((m) => [m.received, m.disposed]));
  return (
    <>
      <ReportPanel
        title="Monthly trends"
        description="Cases received and formally disposed during each calendar month."
        className="ws-monthly-tile"
      >
        <div className="ws-bar-legend">
          <span>
            <i style={{ background: "var(--blue)" }} />
            Received
          </span>
          <span>
            <i style={{ background: "var(--orange)" }} />
            Disposed
          </span>
        </div>
        <div
          className="ws-months"
          role="img"
          aria-label="Monthly received and disposed case counts"
        >
          {months.map((m, i) => (
            <div key={m.label}>
              <div>
                <span
                  style={{
                    height: (m.received / max) * 100 + "%",
                    display: m.received ? undefined : "none",
                    animationDelay: i * 60 + "ms",
                  }}
                  title={`${m.received} received`}
                />
                <i
                  style={{
                    height: (m.disposed / max) * 100 + "%",
                    display: m.disposed ? undefined : "none",
                    animationDelay: i * 60 + 80 + "ms",
                  }}
                  title={`${m.disposed} disposed`}
                />
              </div>
              <b>
                {m.received} / {m.disposed}
              </b>
              <small>{m.label}</small>
            </div>
          ))}
        </div>
      </ReportPanel>
      <ReportPanel
        title="Quarterly totals"
        description="Received and disposed counts for each calendar quarter."
        className="ws-quarterly-tile"
      >
        <table>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Received</th>
              <th>Disposed</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q, i) => (
              <tr key={q.label} style={{ animationDelay: `${i * 100}ms` }}>
                <td>{q.label}</td>
                <td>{q.received}</td>
                <td>{q.disposed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportPanel>
    </>
  );
}
