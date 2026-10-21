CREATE TABLE `burns` (
	`id` integer PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`calories` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `burns_local_date_idx` ON `burns` (`local_date`);