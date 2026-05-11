export interface ParsedLogEntry {
  ip: string;
  timestamp: Date;
  method: string;
  url: string;
  protocol: string | null;
  statusCode: number;
  bytes: number | null;
  referer: string | null;
  userAgent: string | null;
}

// Apache Combined Log Format:
// %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-agent}i"
// 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08"
const COMBINED_REGEX =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*?)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/;

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseApacheDate(raw: string): Date | null {
  // Format: 10/Oct/2000:13:55:36 -0700
  const m = raw.match(
    /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s([+-]\d{4})$/
  );
  if (!m) return null;
  const [, day, mon, year, hh, mm, ss, tz] = m;
  const month = MONTHS[mon];
  if (month === undefined) return null;
  const tzSign = tz[0] === "+" ? 1 : -1;
  const tzH = parseInt(tz.slice(1, 3), 10);
  const tzM = parseInt(tz.slice(3, 5), 10);
  const tzOffset = tzSign * (tzH * 60 + tzM);
  const utcMs =
    Date.UTC(
      parseInt(year, 10),
      month,
      parseInt(day, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
      parseInt(ss, 10)
    ) -
    tzOffset * 60000;
  return new Date(utcMs);
}

export function parseLine(line: string): ParsedLogEntry | null {
  const m = line.match(COMBINED_REGEX);
  if (!m) return null;
  const [, ip, dateStr, request, statusStr, bytesStr, referer, userAgent] = m;

  const ts = parseApacheDate(dateStr);
  if (!ts) return null;

  const reqParts = request.split(" ");
  const method = reqParts[0] ?? "-";
  const url = reqParts[1] ?? "/";
  const protocol = reqParts[2] ?? null;

  const statusCode = parseInt(statusStr, 10);
  if (isNaN(statusCode)) return null;

  const bytes = bytesStr === "-" ? null : parseInt(bytesStr, 10);

  return {
    ip,
    timestamp: ts,
    method,
    url: url.split("?")[0], // strip query strings for grouping
    protocol,
    statusCode,
    bytes: isNaN(bytes ?? NaN) ? null : bytes,
    referer: referer === "-" || !referer ? null : referer,
    userAgent: userAgent === "-" || !userAgent ? null : userAgent,
  };
}

export function detectAppName(url: string): string {
  // Use first path segment as the app name, fall back to "root"
  const parts = url.split("/").filter(Boolean);
  if (parts.length === 0) return "root";
  // Skip common static asset extensions
  const first = parts[0];
  return first;
}

export function parseLogLines(lines: string[]): {
  entries: ParsedLogEntry[];
  totalLines: number;
  parsedLines: number;
} {
  let parsedLines = 0;
  const entries: ParsedLogEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = parseLine(trimmed);
    if (entry) {
      parsedLines++;
      entries.push(entry);
    }
  }
  return { entries, totalLines: lines.length, parsedLines };
}
