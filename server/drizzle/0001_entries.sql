CREATE TABLE `entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`local_date` text NOT NULL,
	`meal_type` text NOT NULL,
	`raw_text` text NOT NULL,
	`model` text NOT NULL,
	`model_response` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_local_date_idx` ON `entries` (`local_date`);--> statement-breakpoint
CREATE TABLE `entry_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`entry_id` integer NOT NULL,
	`name` text NOT NULL,
	`portion` text NOT NULL,
	`calories` integer NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`confidence` text NOT NULL,
	`assumption` text,
	`edited` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_items_entry_id_idx` ON `entry_items` (`entry_id`);