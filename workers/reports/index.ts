import type { Official } from "../../packages/shared/types";
import type { Analytics } from "../../packages/shared/reports";
import type { Env } from "../shared";
import { actor, fail, guard, json, now } from "../shared";
import { applicationEnv } from "../database/client";
import { reportScope } from "../casework/access";
const day = 86400000;
function dataset(url: URL, user: Official) {
  const scope = reportScope(user),
    conditions = ["c.id IN(SELECT id FROM measured)"],
    args: unknown[] = [];
  for (const key of ["from", "to"]) {
    const value = url.searchParams.get(key);
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      fail(400, "Choose valid report dates.");
  }
  if (
    url.searchParams.get("from") &&
    url.searchParams.get("to") &&
    url.searchParams.get("from")! > url.searchParams.get("to")!
  )
    fail(400, "The end date must follow the start date.");
  if (url.searchParams.get("from")) {
    conditions.push("c.received_at>=?");
    args.push(url.searchParams.get("from") + "T00:00:00.000Z");
  }
  if (url.searchParams.get("to")) {
    conditions.push("c.received_at<=?");
    args.push(url.searchParams.get("to") + "T23:59:59.999Z");
  }
  for (const key of ["institution", "bureau", "region", "status"]) {
    const value = url.searchParams.get(key)?.slice(0, 100);
    if (value) {
      conditions.push(
        (key === "institution"
          ? "c.institution_id"
          : key === "region"
            ? "i.region"
            : "c." + key) + "=?",
      );
      args.push(value);
    }
  }
  return {
    historySql:
      scope.sql +
      `, historical AS(SELECT e.* FROM case_events e JOIN cases c ON c.id=e.case_id JOIN institutions i ON i.id=c.institution_id WHERE c.is_demo=? AND (e.actor_id IN(SELECT id FROM reporting) OR e.case_assigned_snapshot IN(SELECT id FROM reporting) OR (?=1 AND e.case_bureau_snapshot=?)) ${conditions.length > 1 ? "AND " + conditions.slice(1).join(" AND ") : ""})`,
    historyArgs: [
      ...scope.args,
      user.is_demo,
      user.role === "manager" && user.report_scope === "bureau" ? 1 : 0,
      user.bureau,
      ...args,
    ],
    label: scope.label,
    sql:
      scope.sql +
      `, filtered AS (SELECT c.*,i.region,i.name institution_name,i.permanent_id FROM cases c JOIN institutions i ON i.id=c.institution_id WHERE ${conditions.join(" AND ")})`,
    args: [...scope.args, ...args],
  };
}
function periods(url: URL) {
  const anchor = new Date(
      Math.min(
        Date.now(),
        url.searchParams.get("to")
          ? Date.parse(url.searchParams.get("to") + "T23:59:59.999Z")
          : Date.now(),
      ),
    ),
    monday = new Date(anchor);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const monthIndex = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth(),
    quarterIndex =
      anchor.getUTCFullYear() * 4 + Math.floor(anchor.getUTCMonth() / 3);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(+monday - (7 - i) * 7 * day),
      end = new Date(+start + 7 * day);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: start.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    };
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const n = monthIndex - 5 + i,
      start = new Date(Date.UTC(Math.floor(n / 12), n % 12, 1)),
      end = new Date(Date.UTC(Math.floor((n + 1) / 12), (n + 1) % 12, 1));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: start.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
    };
  });
  const quarters = Array.from({ length: 4 }, (_, i) => {
    const n = quarterIndex - 3 + i,
      start = new Date(Date.UTC(Math.floor(n / 4), (n % 4) * 3, 1)),
      end = new Date(Date.UTC(Math.floor((n + 1) / 4), ((n + 1) % 4) * 3, 1));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `Q${(n % 4) + 1} ${Math.floor(n / 4)}`,
    };
  });
  return { weeks, months, quarters };
}
export default {
  fetch(request: Request, original: Env) {
    const env = applicationEnv(
      original,
      request.headers.get("x-db-generation"),
    );
    return guard(async () => {
      const user = actor(request, env);
      if (!["official", "manager"].includes(user.role))
        fail(403, "Official report access is required.");
      if (request.method !== "GET") fail(405, "Method not allowed.");
      const url = new URL(request.url),
        source = dataset(url, user);
      if (url.pathname === "/api/reports/export") {
        const fields = [
          "id",
          "subject",
          "institution_name",
          "permanent_id",
          "bureau",
          "region",
          "assigned_to",
          "status",
          "intake",
          "escalated",
          "received_at",
          "due_at",
          "updated_at",
        ];
        let cursor = "",
          first = true,
          done = false;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (done) {
              controller.close();
              return;
            }
            try {
              const rows = await env.DB.prepare(
                `${source.sql} SELECT ${fields.join(",")} FROM filtered WHERE id>? ORDER BY id LIMIT 200`,
              )
                .bind(...source.args, cursor)
                .all<Record<string, unknown>>();
              let text = first ? fields.join(",") + "\r\n" : "";
              first = false;
              text += rows.results
                .map((row) =>
                  fields
                    .map(
                      (field) =>
                        '"' +
                        String(row[field] ?? "")
                          .replace(/^[=+@-]/, "'")
                          .replaceAll('"', '""') +
                        '"',
                    )
                    .join(","),
                )
                .join("\r\n");
              if (rows.results.length) text += "\r\n";
              controller.enqueue(encoder.encode(text));
              if (rows.results.length < 200) {
                done = true;
                controller.close();
              } else cursor = String(rows.results[199].id);
            } catch (error) {
              controller.error(error);
            }
          },
          cancel() {
            done = true;
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="aicte-scoped-report.csv"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (url.pathname !== "/api/reports") fail(404, "Report not found.");
      const ranges = periods(url),
        stamp = now(),
        approved = "c.intake='Approved'",
        active = approved + " AND c.status<>'Disposed'",
        sum = (expression: string) =>
          `COALESCE(SUM(CASE WHEN ${expression} THEN 1 ELSE 0 END),0)`;
      const fields = [
        "COUNT(*) total",
        sum(approved) + " approved",
        sum(active) + " active",
        sum(approved + " AND c.status='Disposed'") + " disposed",
        sum(active + " AND c.due_at<>'' AND c.due_at<?") + " overdue",
        sum("c.intake='Submitted'") + " review",
        sum(active + " AND c.escalated=1") + " escalated",
        sum(
          "EXISTS(SELECT 1 FROM case_events e WHERE e.case_id=c.id AND e.kind='transferred')",
        ) + " transferred",
        sum(
          active +
            " AND EXISTS(SELECT 1 FROM cases other WHERE other.institution_id=c.institution_id AND other.is_demo=c.is_demo AND other.bureau<>c.bureau AND other.intake='Approved' AND other.status<>'Disposed' AND NOT EXISTS(SELECT 1 FROM case_relations r WHERE r.case_id=MIN(c.id,other.id) AND r.related_case_id=MAX(c.id,other.id) AND r.kind='Unrelated'))",
        ) + " overlaps",
        sum(
          "EXISTS(SELECT 1 FROM case_relations r WHERE (r.case_id=c.id OR r.related_case_id=c.id) AND r.kind='Duplicate')",
        ) + " duplicates",
      ];
      const args: unknown[] = [stamp];
      for (const [name, values] of Object.entries(ranges))
        values.forEach((range, i) => {
          fields.push(
            sum("c.received_at>=? AND c.received_at<?") + " " + name + i,
          );
          args.push(range.start, range.end);
        });
      const ageRanges = [
        [0, 7],
        [8, 30],
        [31, 90],
        [91, Infinity],
      ];
      ageRanges.forEach(([lo, hi], i) => {
        const condition =
          hi === Infinity
            ? "c.received_at<=?"
            : "c.received_at>? AND c.received_at<=?";
        fields.push(sum(active + " AND " + condition) + " age" + i);
        if (hi !== Infinity)
          args.push(new Date(Date.now() - (hi + 1) * day).toISOString());
        args.push(new Date(Date.now() - lo * day).toISOString());
      });
      const disposalFields: string[] = [],
        disposalArgs: unknown[] = [];
      for (const [name, values] of Object.entries({
        months: ranges.months,
        quarters: ranges.quarters,
      }))
        values.forEach((range, i) => {
          disposalFields.push(
            sum("e.created_at>=? AND e.created_at<?") + " " + name + i,
          );
          disposalArgs.push(range.start, range.end);
        });
      const results = await env.DB.batch<Record<string, unknown>>([
        env.DB.prepare(
          `${source.sql} SELECT ${fields.join(",")} FROM filtered c`,
        ).bind(...source.args, ...args),
        env.DB.prepare(
          `${source.sql} SELECT bureau,region,status,COUNT(*) n FROM filtered WHERE intake='Approved' GROUP BY bureau,region,status`,
        ).bind(...source.args),
        env.DB.prepare(
          `${source.historySql} SELECT ${disposalFields.join(",")} FROM historical e WHERE e.kind IN('disposed','cancellation_approved')`,
        ).bind(...source.historyArgs, ...disposalArgs),
        env.DB.prepare(
          `${source.historySql} SELECT COUNT(DISTINCT case_id) n FROM historical e WHERE e.kind IN('transferred','transferred_out')`,
        ).bind(...source.historyArgs),
      ]);
      const stats = results[0].results[0] || {},
        disposals = results[2].results[0] || {},
        groups = results[1].results;
      const summary = Object.fromEntries(
        [
          "total",
          "approved",
          "active",
          "disposed",
          "overdue",
          "transferred",
          "overlaps",
          "review",
          "escalated",
          "duplicates",
        ].map((key) => [key, Number(stats[key] || 0)]),
      ) as unknown as Analytics["summary"];
      summary.transferred = Number(results[3].results[0]?.n || 0);
      summary.disposal_rate = summary.approved
        ? Math.round((summary.disposed / summary.approved) * 100)
        : 0;
      const statuses = [
        "Pending",
        "Under process",
        "Awaiting information",
        "Disposed",
      ].map((label) => ({
        label,
        count: groups
          .filter((group) => group.status === label)
          .reduce((n, row) => n + Number(row.n), 0),
      }));
      const bureaus = [...new Set(groups.map((row) => String(row.bureau)))]
        .map((name) => ({
          name,
          active: groups
            .filter((row) => row.bureau === name && row.status !== "Disposed")
            .reduce((n, row) => n + Number(row.n), 0),
          disposed: groups
            .filter((row) => row.bureau === name && row.status === "Disposed")
            .reduce((n, row) => n + Number(row.n), 0),
        }))
        .sort((a, b) => b.active + b.disposed - a.active - a.disposed);
      const regions = [...new Set(groups.map((row) => String(row.region)))]
        .map((name) => ({
          name,
          count: groups
            .filter((row) => row.region === name)
            .reduce((n, row) => n + Number(row.n), 0),
        }))
        .sort((a, b) => b.count - a.count);
      const data: Analytics = {
        scope: source.label,
        as_of: stamp,
        summary,
        statuses,
        bureaus,
        regions,
        weeks: ranges.weeks.map((range, i) => ({
          label: range.label,
          count: Number(stats["weeks" + i] || 0),
        })),
        ages: ageRanges.map(([lo, hi], i) => ({
          label: hi === Infinity ? "91+" : lo + "–" + hi,
          count: Number(stats["age" + i] || 0),
        })),
        months: ranges.months.map((range, i) => ({
          label: range.label,
          received: Number(stats["months" + i] || 0),
          disposed: Number(disposals["months" + i] || 0),
        })),
        quarters: ranges.quarters.map((range, i) => ({
          label: range.label,
          received: Number(stats["quarters" + i] || 0),
          disposed: Number(disposals["quarters" + i] || 0),
        })),
      };
      return json(data);
    });
  },
} satisfies ExportedHandler<Env>;
