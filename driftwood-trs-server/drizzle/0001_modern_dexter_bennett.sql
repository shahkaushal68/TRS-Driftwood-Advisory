CREATE TABLE "ai_provider_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_name" text NOT NULL,
	"provider_type" text NOT NULL,
	"gateway_type" text,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"api_key_last_four" text NOT NULL,
	"default_model" text NOT NULL,
	"fallback_model" text,
	"environment" text NOT NULL,
	"response_format" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"supports_multiple_models" boolean DEFAULT false NOT NULL,
	"supports_fallback" boolean DEFAULT false NOT NULL,
	"connection_status" text DEFAULT 'not_tested' NOT NULL,
	"last_connection_test_at" timestamp,
	"last_connection_test_result" text,
	"last_connection_error" text,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_configuration" ADD CONSTRAINT "ai_provider_configuration_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_configuration" ADD CONSTRAINT "ai_provider_configuration_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_configuration_is_active_idx" ON "ai_provider_configuration" USING btree ("is_active");