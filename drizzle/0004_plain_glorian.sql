DROP INDEX `idx_candidates_context_subject`;--> statement-breakpoint
ALTER TABLE `candidates` ADD `query` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidates` ADD `query_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidates_context_subject_query` ON `candidates` (`context_key`,`subject`,`query_key`);