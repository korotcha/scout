CREATE TABLE `api_connections` (
	`provider` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	`checked_at` text,
	`last_error` text,
	`tariffs_json` text,
	`tariffs_at` text
);
