import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { logSessionsTable, logEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseLogLines, detectAppName } from "../lib/logParser";
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get("/", async (req, res) => {
  const sessions = await db.select().from(logSessionsTable).orderBy(logSessionsTable.createdAt);
  res.json(
    sessions.map((s) => ({
      id: s.id,
      filename: s.filename,
      label: s.label,
      totalLines: s.totalLines,
      parsedLines: s.parsedLines,
      dateFrom: s.dateFrom?.toISOString() ?? null,
      dateTo: s.dateTo?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const label = (req.body?.label as string) || file.originalname;
  const content = file.buffer.toString("utf-8");
  const lines = content.split("\n");

  const { entries, totalLines, parsedLines } = parseLogLines(lines);

  if (parsedLines === 0) {
    return res.status(400).json({ error: "No valid Apache log entries found in file" });
  }

  const timestamps = entries.map((e) => e.timestamp.getTime());
  const dateFrom = new Date(Math.min(...timestamps));
  const dateTo = new Date(Math.max(...timestamps));

  const [session] = await db
    .insert(logSessionsTable)
    .values({
      filename: file.originalname,
      label,
      totalLines,
      parsedLines,
      dateFrom,
      dateTo,
    })
    .returning();

  const BATCH_SIZE = 500;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db.insert(logEntriesTable).values(
      batch.map((e) => ({
        sessionId: session.id,
        ip: e.ip,
        timestamp: e.timestamp,
        method: e.method,
        url: e.url,
        protocol: e.protocol,
        statusCode: e.statusCode,
        bytes: e.bytes,
        referer: e.referer,
        userAgent: e.userAgent,
        appName: detectAppName(e.url),
        hour: e.timestamp.getHours(),
        dayOfWeek: e.timestamp.getDay(),
      }))
    );
  }

  return res.status(201).json({
    id: session.id,
    filename: session.filename,
    label: session.label,
    totalLines: session.totalLines,
    parsedLines: session.parsedLines,
    dateFrom: session.dateFrom?.toISOString() ?? null,
    dateTo: session.dateTo?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
  });
});

router.delete("/:sessionId", async (req, res) => {
  const id = parseInt(req.params.sessionId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });

  const [deleted] = await db.delete(logSessionsTable).where(eq(logSessionsTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Session not found" });

  return res.status(204).send();
});

export default router;
