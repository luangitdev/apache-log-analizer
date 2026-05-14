import { Router, text as expressText } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { logSessionsTable, logEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseLine, detectAppName } from "../lib/logParser";
import * as fs from "fs";
import * as readline from "readline";
import * as os from "os";

const router = Router();

// ── Small-file upload (multer, disk storage, no proxy size issues up to ~50MB) ──
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(null, `lv-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
});

// ── Chunked upload state (for large files that exceed the proxy body limit) ──
interface ChunkSession {
  sessionId: number;
  totalChunks: number;
  chunksReceived: number;
  leftover: string;       // incomplete line carried over from the previous chunk
  totalLines: number;
  parsedLines: number;
  minTs: number;
  maxTs: number;
  expiresAt: number;      // epoch ms — auto-clean stale sessions
}
const chunkSessions = new Map<string, ChunkSession>();

// Clean up sessions that have been idle for more than 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of chunkSessions) {
    if (s.expiresAt < now) chunkSessions.delete(id);
  }
}, 60_000);

function twoHoursFromNow() {
  return Date.now() + 2 * 60 * 60 * 1000;
}

function toRow(sessionId: number, e: NonNullable<ReturnType<typeof parseLine>>) {
  return {
    sessionId,
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
  };
}

async function insertBatch(
  sessionId: number,
  entries: ReturnType<typeof parseLine>[]
): Promise<number> {
  const rows = (entries.filter(Boolean) as NonNullable<ReturnType<typeof parseLine>>[]).map(
    (e) => toRow(sessionId, e)
  );
  if (!rows.length) return 0;

  try {
    await db.insert(logEntriesTable).values(rows);
    return rows.length;
  } catch {
    // Batch failed (likely a row with invalid chars that survived the parser).
    // Fall back to one-by-one insertion so only the bad row is skipped.
    let inserted = 0;
    for (const row of rows) {
      try {
        await db.insert(logEntriesTable).values([row]);
        inserted++;
      } catch {
        // Skip this row silently — the line had data the DB can't store.
      }
    }
    return inserted;
  }
}

function processText(leftover: string, text: string, isFinalChunk: boolean) {
  const combined = leftover + text;
  const cutAt = isFinalChunk ? combined.length : combined.lastIndexOf("\n");

  const toProcess = cutAt <= 0 ? "" : combined.substring(0, cutAt);
  const newLeftover = cutAt <= 0 ? combined : combined.substring(cutAt + 1);

  let totalLines = 0;
  let parsedLines = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;
  const entries: NonNullable<ReturnType<typeof parseLine>>[] = [];

  for (const line of toProcess.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalLines++;
    const entry = parseLine(trimmed);
    if (!entry) continue;
    parsedLines++;
    const ts = entry.timestamp.getTime();
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;
    entries.push(entry);
  }

  return { entries, newLeftover, totalLines, parsedLines, minTs, maxTs };
}

// ── GET /api/logs ──────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
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

// ── POST /api/logs/chunk ───────────────────────────────────────────────────────
// Query params: uploadId, chunkIndex (0-based), totalChunks, filename, label
// Body: raw text/plain chunk (max 12 MB, browser sends 10 MB chunks)
router.post(
  "/chunk",
  expressText({ limit: "12mb", type: "text/plain" }),
  async (req, res) => {
    const uploadId = req.query.uploadId as string;
    const chunkIndex = parseInt(req.query.chunkIndex as string, 10);
    const totalChunks = parseInt(req.query.totalChunks as string, 10);
    const filename = (req.query.filename as string) || "access.log";
    const label = (req.query.label as string) || filename;

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks)) {
      return res.status(400).json({ error: "Missing required params" });
    }

    const chunkText = req.body as string;
    const isFinal = chunkIndex === totalChunks - 1;

    // First chunk: create the DB session record
    if (chunkIndex === 0) {
      const [session] = await db
        .insert(logSessionsTable)
        .values({ filename, label, totalLines: 0, parsedLines: 0 })
        .returning();

      chunkSessions.set(uploadId, {
        sessionId: session.id,
        totalChunks,
        chunksReceived: 0,
        leftover: "",
        totalLines: 0,
        parsedLines: 0,
        minTs: Infinity,
        maxTs: -Infinity,
        expiresAt: twoHoursFromNow(),
      });
    }

    const session = chunkSessions.get(uploadId);
    if (!session) {
      return res.status(400).json({ error: "Unknown uploadId — start from chunk 0" });
    }

    // Process lines in this chunk
    const { entries, newLeftover, totalLines, parsedLines, minTs, maxTs } =
      processText(session.leftover, chunkText, isFinal);

    const BATCH_SIZE = 500;
    let actuallyInserted = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      actuallyInserted += await insertBatch(session.sessionId, entries.slice(i, i + BATCH_SIZE));
    }

    session.leftover = newLeftover;
    session.chunksReceived++;
    session.totalLines += totalLines;
    session.parsedLines += actuallyInserted;
    if (minTs < session.minTs) session.minTs = minTs;
    if (maxTs > session.maxTs) session.maxTs = maxTs;
    session.expiresAt = twoHoursFromNow();

    // Final chunk: close out the session record
    if (isFinal) {
      if (session.parsedLines === 0) {
        await db.delete(logSessionsTable).where(eq(logSessionsTable.id, session.sessionId));
        chunkSessions.delete(uploadId);
        return res.status(400).json({ error: "No valid Apache log entries found in file" });
      }

      const [updated] = await db
        .update(logSessionsTable)
        .set({
          totalLines: session.totalLines,
          parsedLines: session.parsedLines,
          dateFrom: isFinite(session.minTs) ? new Date(session.minTs) : null,
          dateTo: isFinite(session.maxTs) ? new Date(session.maxTs) : null,
        })
        .where(eq(logSessionsTable.id, session.sessionId))
        .returning();

      chunkSessions.delete(uploadId);

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
    }

    // Non-final chunk: acknowledge
    return res.status(200).json({
      chunkIndex,
      chunksReceived: session.chunksReceived,
      parsedSoFar: session.parsedLines,
    });
  }
);

// ── POST /api/logs (small files via multer / disk storage) ────────────────────
router.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const label = (req.body?.label as string) || file.originalname;
  const tmpPath = file.path;

  try {
    const [session] = await db
      .insert(logSessionsTable)
      .values({ filename: file.originalname, label, totalLines: 0, parsedLines: 0 })
      .returning();

    const BATCH_SIZE = 500;
    let batch: Parameters<typeof insertBatch>[1] = [];
    let totalLines = 0;
    let parsedLines = 0;
    let minTs = Infinity;
    let maxTs = -Infinity;

    const flush = async () => {
      if (!batch.length) return;
      await insertBatch(session.id, batch);
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
        batch.push(entry);
        if (batch.length >= BATCH_SIZE) {
          rl.pause();
          flush().then(() => rl.resume()).catch(reject);
        }
      });
      rl.on("close", resolve);
      rl.on("error", reject);
    });

    await flush();

    if (parsedLines === 0) {
      await db.delete(logSessionsTable).where(eq(logSessionsTable.id, session.id));
      return res.status(400).json({ error: "No valid Apache log entries found in file" });
    }

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
    fs.unlink(tmpPath, () => {});
  }
});

// ── DELETE /api/logs/:sessionId ───────────────────────────────────────────────
router.delete("/:sessionId", async (req, res) => {
  const id = parseInt(req.params.sessionId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });

  const [deleted] = await db
    .delete(logSessionsTable)
    .where(eq(logSessionsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Session not found" });

  return res.status(204).send();
});

export default router;
