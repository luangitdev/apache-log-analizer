import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const router = Router();

function parseSessionId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "" || raw === "null" || raw === "undefined") return null;
  const n = parseInt(raw as string, 10);
  return isNaN(n) ? null : n;
}

router.get("/overview", async (req, res) => {
  const sessionId = parseSessionId(req.query.sessionId);
  const where = sessionId !== null ? eq(logEntriesTable.sessionId, sessionId) : undefined;

  const [totals] = await db
    .select({
      totalRequests: sql<number>`cast(count(*) as integer)`,
      uniqueIPs: sql<number>`cast(count(distinct ${logEntriesTable.ip}) as integer)`,
      totalApps: sql<number>`cast(count(distinct ${logEntriesTable.appName}) as integer)`,
      totalPages: sql<number>`cast(count(distinct ${logEntriesTable.url}) as integer)`,
      dateFrom: sql<string>`min(${logEntriesTable.timestamp})`,
      dateTo: sql<string>`max(${logEntriesTable.timestamp})`,
    })
    .from(logEntriesTable)
    .where(where);

  const [peakHourRow] = await db
    .select({
      hour: logEntriesTable.hour,
      cnt: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(logEntriesTable.hour)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  const [peakDayRow] = await db
    .select({
      dayOfWeek: logEntriesTable.dayOfWeek,
      cnt: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(logEntriesTable.dayOfWeek)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  const totalRequests = totals?.totalRequests ?? 0;
  const dateFrom = totals?.dateFrom ?? null;
  const dateTo = totals?.dateTo ?? null;

  let avgRequestsPerHour = 0;
  if (dateFrom && dateTo) {
    const fromMs = new Date(dateFrom).getTime();
    const toMs = new Date(dateTo).getTime();
    const hours = Math.max(1, (toMs - fromMs) / 3600000);
    avgRequestsPerHour = totalRequests / hours;
  }

  res.json({
    totalRequests,
    uniqueIPs: totals?.uniqueIPs ?? 0,
    totalApps: totals?.totalApps ?? 0,
    totalPages: totals?.totalPages ?? 0,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : null,
    dateTo: dateTo ? new Date(dateTo).toISOString() : null,
    avgRequestsPerHour: Math.round(avgRequestsPerHour * 10) / 10,
    peakHour: peakHourRow?.hour ?? 0,
    peakDay: peakDayRow?.dayOfWeek ?? 0,
  });
});

router.get("/heatmap", async (req, res) => {
  const sessionId = parseSessionId(req.query.sessionId);
  const appName = (req.query.appName as string) || null;

  const filters = [
    ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
    ...(appName ? [eq(logEntriesTable.appName, appName)] : []),
  ];
  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      dayOfWeek: logEntriesTable.dayOfWeek,
      hour: logEntriesTable.hour,
      requestCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(logEntriesTable.dayOfWeek, logEntriesTable.hour)
    .orderBy(logEntriesTable.dayOfWeek, logEntriesTable.hour);

  res.json(rows.map((r) => ({ dayOfWeek: r.dayOfWeek, hour: r.hour, requestCount: r.requestCount })));
});

router.get("/timeline", async (req, res) => {
  const sessionId = parseSessionId(req.query.sessionId);
  const appName = (req.query.appName as string) || null;
  const granularity = (req.query.granularity as string) === "day" ? "day" : "hour";

  const filters = [
    ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
    ...(appName ? [eq(logEntriesTable.appName, appName)] : []),
  ];
  const where = filters.length > 0 ? and(...filters) : undefined;

  const truncExpr =
    granularity === "day"
      ? sql`date_trunc('day', ${logEntriesTable.timestamp})`
      : sql`date_trunc('hour', ${logEntriesTable.timestamp})`;

  const rows = await db
    .select({
      timestamp: truncExpr,
      requestCount: sql<number>`cast(count(*) as integer)`,
      uniqueIPs: sql<number>`cast(count(distinct ${logEntriesTable.ip}) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  res.json(
    rows.map((r) => ({
      timestamp: new Date(r.timestamp as string).toISOString(),
      requestCount: r.requestCount,
      uniqueIPs: r.uniqueIPs,
    }))
  );
});

router.get("/status-codes", async (req, res) => {
  const sessionId = parseSessionId(req.query.sessionId);
  const appName = (req.query.appName as string) || null;

  const filters = [
    ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
    ...(appName ? [eq(logEntriesTable.appName, appName)] : []),
  ];
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [total] = await db
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(logEntriesTable)
    .where(where);

  const rows = await db
    .select({
      statusCode: logEntriesTable.statusCode,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(logEntriesTable.statusCode)
    .orderBy(sql`count(*) desc`);

  const totalCount = total?.total ?? 1;
  res.json(
    rows.map((r) => ({
      statusCode: r.statusCode,
      count: r.count,
      percentage: Math.round((r.count / totalCount) * 1000) / 10,
    }))
  );
});

export default router;
