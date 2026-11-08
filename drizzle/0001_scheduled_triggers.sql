CREATE TABLE `scheduled_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'reminder' NOT NULL,
	`item_id` text NOT NULL,
	`reminder_id` text,
	`occurrence_start` integer NOT NULL,
	`fire_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`snooze_count` integer DEFAULT 0 NOT NULL,
	`fired_at` integer,
	`acknowledged_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `triggers_unique_idx` ON `scheduled_triggers` (`reminder_id`,`occurrence_start`);--> statement-breakpoint
CREATE INDEX `triggers_due_idx` ON `scheduled_triggers` (`status`,`fire_at`);