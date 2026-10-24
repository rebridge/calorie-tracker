ALTER TABLE `burns` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `burns_client_id_idx` ON `burns` (`client_id`);--> statement-breakpoint
ALTER TABLE `entries` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `entries_client_id_idx` ON `entries` (`client_id`);