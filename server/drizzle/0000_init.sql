CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`calorie_goal` integer DEFAULT 2000 NOT NULL,
	`protein_goal_g` integer DEFAULT 150 NOT NULL,
	`carbs_goal_g` integer DEFAULT 200 NOT NULL,
	`fat_goal_g` integer DEFAULT 65 NOT NULL
);
--> statement-breakpoint
INSERT INTO `settings` (`id`) VALUES (1);
