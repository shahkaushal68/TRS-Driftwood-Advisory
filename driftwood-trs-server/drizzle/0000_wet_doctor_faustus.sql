CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"deleted_at" timestamp,
	"ai_review_status" text DEFAULT 'idle' NOT NULL,
	"ai_review_submitted_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"raw_output" jsonb NOT NULL,
	"ai_verdict" text,
	"report_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ai_analysis_document_id_uniq" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "intake_document" (
	"id" text PRIMARY KEY NOT NULL,
	"uploaded_by" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"file_size" integer,
	"trs_domain" text,
	"evidence_category" text,
	"evidence_type" text,
	"notes" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"ai_review_status" text DEFAULT 'pending' NOT NULL,
	"analyst_id" text,
	"sufficiency_rating" text,
	"analyst_validation_status" text,
	"published_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_document_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"created_by" text NOT NULL,
	"trs_domain" text NOT NULL,
	"evidence_category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sufficiency_rating" text,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_version" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"category" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_version_domain_category_version_uniq" UNIQUE("domain","category","version")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_document_id_intake_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."intake_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_document" ADD CONSTRAINT "intake_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_document" ADD CONSTRAINT "intake_document_analyst_id_user_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_document_finding" ADD CONSTRAINT "intake_document_finding_document_id_intake_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."intake_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_document_finding" ADD CONSTRAINT "intake_document_finding_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "ai_analysis_document_id_idx" ON "ai_analysis" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "intake_document_uploaded_by_idx" ON "intake_document" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "intake_document_status_idx" ON "intake_document" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intake_document_trs_domain_idx" ON "intake_document" USING btree ("trs_domain");--> statement-breakpoint
CREATE INDEX "intake_document_finding_document_id_idx" ON "intake_document_finding" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "intake_document_finding_created_by_idx" ON "intake_document_finding" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ai_prompt_version_domain_category_idx" ON "ai_prompt_version" USING btree ("domain","category");