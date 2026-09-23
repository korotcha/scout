import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const screenerMarks = pgTable("screener_marks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  contextKey: text("context_key").notNull(), queryKey: text("query_key").notNull(),
  query: text("query").notNull(), subject: text("subject").notNull(),
  status: text("status", { enum: ["shortlisted", "excluded"] }).notNull(),
  updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_screener_marks_context_query").on(table.contextKey, table.queryKey)]);

export const apiConnections = pgTable("api_connections", {
  provider: text("provider").primaryKey(), encryptedKey: text("encrypted_key").notNull(),
  revision: integer("revision").notNull(), updatedAt: text("updated_at").notNull(),
  checkedAt: text("checked_at"), lastError: text("last_error"),
  tariffsJson: text("tariffs_json"), tariffsAt: text("tariffs_at"),
});

export const calculatorSettings = pgTable("calculator_settings", {
  id: integer("id").primaryKey(), valueJson: text("value_json").notNull(), revision: integer("revision").notNull(),
  updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
});

export const analysisProjects = pgTable("analysis_projects", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  launchMonth: text("launch_month"),
  currentPeriod: text("current_period").notNull(),
  comparisonPeriod: text("comparison_period").notNull(),
  createdBy: text("created_by").notNull().default("Неизвестный пользователь"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});

export const uploads = pgTable("uploads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  projectId: bigint("project_id", { mode: "number" }).references(() => analysisProjects.id),
  role: text("role", { enum: ["db1", "db2"] }).notNull(),
  periodDate: text("period_date").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  rowCount: integer("row_count"),
  uniqueQueries: integer("unique_queries"),
  uniqueSubjects: integer("unique_subjects"),
  status: text("status").notNull().default("uploaded"),
  issueCount: integer("issue_count").notNull().default(0),
  issuesJson: text("issues_json").notNull().default("[]"),
  uploadedBy: text("uploaded_by").notNull().default("Неизвестный пользователь"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});

export const exclusions = pgTable(
  "exclusions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subject: text("subject").notNull(),
    active: boolean("active").notNull().default(true),
    reason: text("reason").notNull().default(""),
    updatedBy: text("updated_by").notNull().default("Неизвестный пользователь"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [uniqueIndex("idx_exclusions_subject").on(table.subject)]
);

export const subjectReviews = pgTable(
  "subject_reviews",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("analysis"),
    comment: text("comment").notNull().default(""),
    updatedBy: text("updated_by").notNull().default("Неизвестный пользователь"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  },
  (table) => [uniqueIndex("idx_subject_reviews_subject").on(table.subject)]
);

export const candidates = pgTable("candidates", {
  id: text("id").primaryKey(),
  contextKey: text("context_key").notNull(),
  projectId: bigint("project_id", { mode: "number" }).references(() => analysisProjects.id),
  subject: text("subject").notNull(),
  query: text("query").notNull().default(""),
  queryKey: text("query_key").notNull().default(""),
  period: text("period").notNull(),
  status: text("status").notNull().default("analysis"),
  analysisPassed: integer("analysis_passed").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  contentJson: text("content_json").notNull(),
  historyJson: text("history_json").notNull().default("[]"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("idx_candidates_context_subject_query").on(table.contextKey, table.subject, table.queryKey),
  uniqueIndex("idx_candidates_context_query").on(table.contextKey, table.queryKey).where(sql`${table.queryKey} <> ''`),
]);

export const queryAnalysisJobs = pgTable("query_analysis_jobs", {
  queryKey: text("query_key").primaryKey(), objectKey: text("object_key").notNull(),
  leaseUntil: text("lease_until"), leaseId: text("lease_id"), updatedAt: text("updated_at").notNull(),
});
