import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logSessionsTable = pgTable("log_sessions", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  label: text("label").notNull(),
  totalLines: integer("total_lines").notNull().default(0),
  parsedLines: integer("parsed_lines").notNull().default(0),
  dateFrom: timestamp("date_from", { withTimezone: true }),
  dateTo: timestamp("date_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLogSessionSchema = createInsertSchema(logSessionsTable).omit({ id: true, createdAt: true });
export type InsertLogSession = z.infer<typeof insertLogSessionSchema>;
export type LogSession = typeof logSessionsTable.$inferSelect;
