import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db";
import { sql, eq, and, inArray } from "drizzle-orm";

const router = Router();

function parseSessionId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "" || raw === "null" || raw === "undefined") return null;
  const n = parseInt(raw as string, 10);
  return isNaN(n) ? null : n;
}

function sessionFilter(sessionId: number | null) {
  return sessionId !== null ? eq(logEntriesTable.sessionId, sessionId) : undefined;
}

router.get("/", async (req, res) => {
  const sessionId = parseSessionId(req.query.sessionId);

  const where = sessionFilter(sessionId);

  const rows = await db
    .select({
      appName: logEntriesTable.appName,
      requestCount: sql<number>`cast(count(*) as integer)`,
      uniqueIPs: sql<number>`cast(count(distinct ${logEntriesTable.ip}) as integer)`,
    })
    .from(logEntriesTable)
    .where(where)
    .groupBy(logEntriesTable.appName)
    .orderBy(sql`count(*) desc`);

  // For each app, find peak hour and top page
  const apps = await Promise.all(
    rows.map(async (row) => {
      const filters = [
        eq(logEntriesTable.appName, row.appName),
        ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
      ];

      const [peakHourRow] = await db
        .select({
          hour: logEntriesTable.hour,
          cnt: sql<number>`cast(count(*) as integer)`,
        })
        .from(logEntriesTable)
        .where(and(...filters))
        .groupBy(logEntriesTable.hour)
        .orderBy(sql`count(*) desc`)
        .limit(1);

      const [peakDayRow] = await db
        .select({
          dayOfWeek: logEntriesTable.dayOfWeek,
          cnt: sql<number>`cast(count(*) as integer)`,
        })
        .from(logEntriesTable)
        .where(and(...filters))
        .groupBy(logEntriesTable.dayOfWeek)
        .orderBy(sql`count(*) desc`)
        .limit(1);

      const [topPageRow] = await db
        .select({
          url: logEntriesTable.url,
          cnt: sql<number>`cast(count(*) as integer)`,
        })
        .from(logEntriesTable)
        .where(and(...filters))
        .groupBy(logEntriesTable.url)
        .orderBy(sql`count(*) desc`)
        .limit(1);

      return {
        name: row.appName,
        requestCount: row.requestCount,
        uniqueIPs: row.uniqueIPs,
        peakHour: peakHourRow?.hour ?? 0,
        peakDayOfWeek: peakDayRow?.dayOfWeek ?? 0,
        topPage: topPageRow?.url ?? null,
      };
    })
  );

  res.json(apps);
});

router.get("/:appName/patterns", async (req, res) => {
  const { appName } = req.params;
  const sessionId = parseSessionId(req.query.sessionId);

  const filters = [
    eq(logEntriesTable.appName, appName),
    ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
  ];

  const heatmapRows = await db
    .select({
      dayOfWeek: logEntriesTable.dayOfWeek,
      hour: logEntriesTable.hour,
      requestCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(and(...filters))
    .groupBy(logEntriesTable.dayOfWeek, logEntriesTable.hour)
    .orderBy(logEntriesTable.dayOfWeek, logEntriesTable.hour);

  const hourlyRows = await db
    .select({
      hour: logEntriesTable.hour,
      requestCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(logEntriesTable)
    .where(and(...filters))
    .groupBy(logEntriesTable.hour)
    .orderBy(logEntriesTable.hour);

  res.json({
    appName,
    heatmap: heatmapRows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      hour: r.hour,
      requestCount: r.requestCount,
    })),
    hourlyTotals: hourlyRows.map((r) => ({
      hour: r.hour,
      requestCount: r.requestCount,
    })),
  });
});

router.get("/:appName/pages", async (req, res) => {
  const { appName } = req.params;
  const sessionId = parseSessionId(req.query.sessionId);
  const hourFrom = req.query.hourFrom ? parseInt(req.query.hourFrom as string, 10) : null;
  const hourTo = req.query.hourTo ? parseInt(req.query.hourTo as string, 10) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

  const filters = [
    eq(logEntriesTable.appName, appName),
    ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
    ...(hourFrom !== null ? [sql`${logEntriesTable.hour} >= ${hourFrom}`] : []),
    ...(hourTo !== null ? [sql`${logEntriesTable.hour} <= ${hourTo}`] : []),
  ];

  const pageRows = await db
    .select({
      url: logEntriesTable.url,
      requestCount: sql<number>`cast(count(*) as integer)`,
      uniqueIPs: sql<number>`cast(count(distinct ${logEntriesTable.ip}) as integer)`,
      avgBytes: sql<number>`cast(avg(${logEntriesTable.bytes}) as numeric)`,
    })
    .from(logEntriesTable)
    .where(and(...filters))
    .groupBy(logEntriesTable.url)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  // For each top page, compute status code distribution and hourly distribution
  const pages = await Promise.all(
    pageRows.map(async (row) => {
      const pageFilters = [
        eq(logEntriesTable.appName, appName),
        eq(logEntriesTable.url, row.url),
        ...(sessionId !== null ? [eq(logEntriesTable.sessionId, sessionId)] : []),
      ];

      const statusRows = await db
        .select({
          statusCode: logEntriesTable.statusCode,
          cnt: sql<number>`cast(count(*) as integer)`,
        })
        .from(logEntriesTable)
        .where(and(...pageFilters))
        .groupBy(logEntriesTable.statusCode);

      const statusCodes: Record<number, number> = {};
      for (const sr of statusRows) {
        statusCodes[sr.statusCode] = sr.cnt;
      }

      const hourlyRows = await db
        .select({
          hour: logEntriesTable.hour,
          requestCount: sql<number>`cast(count(*) as integer)`,
        })
        .from(logEntriesTable)
        .where(and(...pageFilters))
        .groupBy(logEntriesTable.hour)
        .orderBy(logEntriesTable.hour);

      return {
        url: row.url,
        requestCount: row.requestCount,
        uniqueIPs: row.uniqueIPs,
        avgBytes: row.avgBytes !== null ? Number(row.avgBytes) : null,
        statusCodes,
        hourlyDistribution: hourlyRows.map((h) => ({ hour: h.hour, requestCount: h.requestCount })),
      };
    })
  );

  res.json(pages);
});

export default router;
