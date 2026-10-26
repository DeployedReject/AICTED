import ReportPanel from "./ReportPanel";
import type { Analytics } from "../../packages/shared/reports";
export default function ReportPeriods({ data }: { data: Analytics }) {
  const { months, quarters } = data;
  const max = Math.max(1, ...months.flatMap((m) => [m.received, m.disposed]));
  return (
    <>
      <ReportPanel
        title="Monthly trends"
        description="Received cases in this report and formal disposal events during each calendar month."
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
