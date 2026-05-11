import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { logSessionsTable } from "./logSessions";

export const logEntriesTable = pgTable(
  "log_entries",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => logSessionsTable.id, { onDelete: "cascade" }),
    ip: text("ip").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
    url: text("url").notNull(),
    protocol: text("protocol"),
    statusCode: integer("status_code").notNull(),
    bytes: integer("bytes"),
    referer: text("referer"),
    userAgent: text("user_agent"),
    appName: text("app_name").notNull(),
    hour: integer("hour").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
  },
  (t) => [
    index("idx_log_entries_session_id").on(t.sessionId),
    index("idx_log_entries_app_name").on(t.appName),
    index("idx_log_entries_hour").on(t.hour),
    index("idx_log_entries_day_hour").on(t.dayOfWeek, t.hour),
    index("idx_log_entries_timestamp").on(t.timestamp),
  ]
);

export type LogEntry = typeof logEntriesTable.$inferSelect;
