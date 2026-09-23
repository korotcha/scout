CREATE TABLE `analysis_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`current_period` text NOT NULL,
	`comparison_period` text NOT NULL,
	`created_by` text DEFAULT 'Неизвестный пользователь' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `uploads` ADD `project_id` integer REFERENCES analysis_projects(id);