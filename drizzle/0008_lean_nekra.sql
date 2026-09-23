CREATE TABLE `screener_marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_key` text NOT NULL,
	`query_key` text NOT NULL,
	`query` text NOT NULL,
	`subject` text NOT NULL,
	`status` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_screener_marks_context_query` ON `screener_marks` (`context_key`,`query_key`);