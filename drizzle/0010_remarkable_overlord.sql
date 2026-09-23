CREATE TABLE `query_analysis_jobs` (
	`query_key` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`lease_until` text,
	`lease_id` text,
	`updated_at` text NOT NULL
);
