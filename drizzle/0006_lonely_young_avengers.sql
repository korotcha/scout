CREATE TABLE `calculator_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
