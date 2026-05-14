import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { logSessionsTable, logEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseLine, detectAppName } from "../lib/logParser";
import * as fs from "fs";
import * as readline from "readline";
import * as os from "os";
import * as path from "path";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(null, `logvision-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
});

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
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const label = (req.body?.label as string) || file.originalname;
  const tmpPath = file.path;

  try {
    // Create session record first so we have an ID to insert entries against
    const [session] = await db
      .insert(logSessionsTable)
      .values({ filename: file.originalname, label, totalLines: 0, parsedLines: 0 })
      .returning();

    const BATCH_SIZE = 500;
    let batch: Parameters<typeof db.insert>[0] extends never ? never : {
      sessionId: number; ip: string; timestamp: Date; method: string;
      url: string; protocol: string | null; statusCode: number;
      bytes: number | null; referer: string | null; userAgent: string | null;
      appName: string; hour: number; dayOfWeek: number;
    }[] = [];

    let totalLines = 0;
    let parsedLines = 0;
    let minTs = Infinity;
    let maxTs = -Infinity;

    const flushBatch = async () => {
      if (batch.length === 0) return;
      await db.insert(logEntriesTable).values(batch);
      batch = [];
    };

    await new Promise<void>((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(tmpPath, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });

      rl.on("line", async (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        totalLines++;

        const entry = parseLine(trimmed);
        if (!entry) return;
        parsedLines++;

        const ts = entry.timestamp.getTime();
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;

        batch.push({
          sessionId: session.id,
          ip: entry.ip,
          timestamp: entry.timestamp,
          method: entry.method,
          url: entry.url,
          protocol: entry.protocol,
          statusCode: entry.statusCode,
          bytes: entry.bytes,
          referer: entry.referer,
          userAgent: entry.userAgent,
          appName: detectAppName(entry.url),
          hour: entry.timestamp.getHours(),
          dayOfWeek: entry.timestamp.getDay(),
        });

        if (batch.length >= BATCH_SIZE) {
          rl.pause();
          flushBatch()
            .then(() => rl.resume())
            .catch(reject);
        }
      });

      rl.on("close", resolve);
      rl.on("error", reject);
    });

    // Flush any remaining entries
    await flushBatch();

    if (parsedLines === 0) {
      await db.delete(logSessionsTable).where(eq(logSessionsTable.id, session.id));
      return res.status(400).json({ error: "No valid Apache log entries found in file" });
    }

    // Update session with final counts and date range
    const [updated] = await db
      .update(logSessionsTable)
      .set({
        totalLines,
        parsedLines,
        dateFrom: isFinite(minTs) ? new Date(minTs) : null,
        dateTo: isFinite(maxTs) ? new Date(maxTs) : null,
      })
      .where(eq(logSessionsTable.id, session.id))
      .returning();

    return res.status(201).json({
      id: updated.id,
      filename: updated.filename,
      label: updated.label,
      totalLines: updated.totalLines,
      parsedLines: updated.parsedLines,
      dateFrom: updated.dateFrom?.toISOString() ?? null,
      dateTo: updated.dateTo?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } finally {
    // Always clean up the temp file
    fs.unlink(tmpPath, () => {});
  }
});

router.delete("/:sessionId", async (req, res) => {
  const id = parseInt(req.params.sessionId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });

  const [deleted] = await db.delete(logSessionsTable).where(eq(logSessionsTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Session not found" });

  return res.status(204).send();
});

export default router;
