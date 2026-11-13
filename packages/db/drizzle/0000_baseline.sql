CREATE TABLE "artifact_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"tool_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_versions_seq" UNIQUE("artifact_id","version"),
	CONSTRAINT "artifact_versions_kind" CHECK (kind in ('brief', 'recipe'))
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"head_version_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"license" text,
	"indexable" boolean DEFAULT false NOT NULL,
	"origin_decision_id" uuid,
	"origin_artifact_id" uuid,
	"published_version_id" uuid,
	"share_slug" text,
	"skeleton_hash" text,
	"moderation_state" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "artifacts_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_actor" CHECK (actor in ('user', 'system', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"card" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_kind" CHECK (kind in ('tool', 'family'))
);
--> statement-breakpoint
CREATE TABLE "consent_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"version" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_purpose" CHECK (purpose in ('personalize', 'improve_defaults', 'cloud_asr', 'llm_processing', 'page_context', 'train_models'))
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid NOT NULL,
	"point" text NOT NULL,
	"session_id" uuid,
	"context" jsonb NOT NULL,
	"shown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text,
	"outcome_at" timestamp with time zone,
	"rating" text,
	"rated_at" timestamp with time zone,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_outcome" CHECK (outcome in ('inserted', 'copied', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid NOT NULL,
	"type" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"scope_ref" text,
	"sensitivity" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"text" text,
	"source" text NOT NULL,
	"evidence_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"strength" real DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"helpful" integer DEFAULT 0 NOT NULL,
	"superseded_by" uuid,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "memory_kind" CHECK (kind in ('profile', 'preference', 'rule', 'fact', 'goal', 'vocabulary')),
	CONSTRAINT "memory_scope" CHECK (scope in ('global', 'tool', 'project')),
	CONSTRAINT "memory_sensitivity" CHECK (sensitivity in ('normal', 'sensitive', 'special')),
	CONSTRAINT "memory_status" CHECK (status in ('active', 'proposed', 'archived')),
	CONSTRAINT "memory_source" CHECK (source in ('user', 'proposal')),
	CONSTRAINT "memory_text" CHECK (("memory_items"."deleted_at" is null) = ("memory_items"."text" is not null))
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_item_id" text NOT NULL,
	"source_url" text NOT NULL,
	"heading" text,
	"text" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"point" text NOT NULL,
	"pid" uuid,
	"version" text NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_state_point_pid" UNIQUE NULLS NOT DISTINCT("point","pid")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid,
	"kind" text NOT NULL,
	"auth_user_id" uuid,
	"device_hash" text,
	"handle" text,
	"trust_level" smallint DEFAULT 0 NOT NULL,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profiles_pid_unique" UNIQUE("pid"),
	CONSTRAINT "profiles_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "profiles_kind" CHECK (kind in ('guest', 'account')),
	CONSTRAINT "profiles_identity" CHECK (("profiles"."kind" = 'account') = ("profiles"."auth_user_id" is not null)),
	CONSTRAINT "profiles_handle_len" CHECK (char_length("profiles"."handle") <= 64)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"decision_id" uuid,
	"artifact_id" uuid,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reason" CHECK (reason in ('wrong_or_harmful', 'illegal', 'child_safety', 'harassment', 'sexual', 'privacy', 'copyright', 'spam', 'other')),
	CONSTRAINT "reports_target" CHECK ("reports"."decision_id" is not null or "reports"."artifact_id" is not null),
	CONSTRAINT "reports_note_len" CHECK (char_length("reports"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "slot_counts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"value" text NOT NULL,
	"context_key" text NOT NULL,
	"weight" real NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"decision_id" uuid,
	"event_id" uuid,
	CONSTRAINT "slot_counts_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "tool_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pid" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"host_app" text,
	"surface" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"event_id" uuid,
	CONSTRAINT "tool_usage_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "tool_usage_surface" CHECK (surface in ('desktop', 'web', 'mcp'))
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_day_metric_pk" PRIMARY KEY("user_id","day","metric"),
	CONSTRAINT "usage_metric" CHECK (metric in ('forges', 'dictation_seconds', 'cost_microusd'))
);
--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_head_version_id_artifact_versions_id_fk" FOREIGN KEY ("head_version_id") REFERENCES "public"."artifact_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_ledger" ADD CONSTRAINT "consent_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_superseded_by_memory_items_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."memory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_user" ON "artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_pid" ON "audit_log" USING btree ("pid","at");--> statement-breakpoint
CREATE INDEX "consent_ledger_latest" ON "consent_ledger" USING btree ("user_id","purpose","at");--> statement-breakpoint
CREATE INDEX "decisions_pid" ON "decisions" USING btree ("pid","created_at");--> statement-breakpoint
CREATE INDEX "events_pid" ON "events" USING btree ("pid");--> statement-breakpoint
CREATE INDEX "memory_items_user" ON "memory_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passages_search" ON "passages" USING gin ("search");--> statement-breakpoint
CREATE INDEX "passages_item" ON "passages" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_live_device" ON "profiles" USING btree ("device_hash") WHERE "profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "slot_counts_pid" ON "slot_counts" USING btree ("pid","at");--> statement-breakpoint
CREATE INDEX "subscriptions_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_usage_pid" ON "tool_usage" USING btree ("pid","at");