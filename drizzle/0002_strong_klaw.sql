CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`context_key` text NOT NULL,
	`project_id` integer,
	`subject` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'analysis' NOT NULL,
	`analysis_passed` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`content_json` text NOT NULL,
	`history_json` text DEFAULT '[]' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `analysis_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidates_context_subject` ON `candidates` (`context_key`,`subject`);