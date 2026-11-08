CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`at` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_logs_item_idx` ON `activity_logs` (`item_id`,`at`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`graph` text DEFAULT '{"nodes":[],"edges":[]}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text,
	`item_id` text,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `execution_logs_started_idx` ON `execution_logs` (`started_at`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'task' NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`estimated_minutes` integer,
	`due_at` integer,
	`priority` integer DEFAULT 3 NOT NULL,
	`category` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`flexibility` text DEFAULT 'rigid' NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_start_idx` ON `items` (`start_at`);--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);--> statement-breakpoint
CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`rrule` text NOT NULL,
	`timezone` text NOT NULL,
	`exceptions` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurrences_item_id_unique` ON `recurrences` (`item_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	`snooze_policy` text DEFAULT '{"minutes":10,"maxSnoozes":3}' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resource_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`open_mode` text DEFAULT 'auto' NOT NULL,
	`default_delay_ms` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_packages_item_id_unique` ON `resource_packages` (`item_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`target` text NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`delay_ms` integer,
	FOREIGN KEY (`package_id`) REFERENCES `resource_packages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resources_package_idx` ON `resources` (`package_id`,`position`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
