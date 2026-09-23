CREATE TABLE `exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT 'Неизвестный пользователь' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exclusions_subject` ON `exclusions` (`subject`);--> statement-breakpoint
CREATE TABLE `subject_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'analysis' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT 'Неизвестный пользователь' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subject_reviews_subject` ON `subject_reviews` (`subject`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`period_date` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`row_count` integer,
	`unique_queries` integer,
	`unique_subjects` integer,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`issue_count` integer DEFAULT 0 NOT NULL,
	`issues_json` text DEFAULT '[]' NOT NULL,
	`uploaded_by` text DEFAULT 'Неизвестный пользователь' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_object_key_unique` ON `uploads` (`object_key`);