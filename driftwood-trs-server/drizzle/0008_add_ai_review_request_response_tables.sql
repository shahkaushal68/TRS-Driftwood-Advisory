CREATE TABLE "ai_review_request" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"document_id" text NOT NULL,
	"trs_domain" text NOT NULL,
	"evidence_category" text NOT NULL,
	"prompt_template_id" text NOT NULL,
	"prompt_version_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"initiated_by_user_id" text NOT NULL,
	"initiated_at" timestamp NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_response" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"document_id" text NOT NULL,
	"raw_response" jsonb NOT NULL,
	"structured_markdown_response" text,
	"parsed_findings" jsonb,
	"evidence_sufficiency" text,
	"ai_confidence" text,
	"primary_color_indicator" text,
	"recommended_analyst_action" text,
	"analyst_review_status" text DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ai_review_response_request_id_uniq" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "ai_review_request" ADD CONSTRAINT "ai_review_request_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_request" ADD CONSTRAINT "ai_review_request_document_id_intake_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."intake_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_request" ADD CONSTRAINT "ai_review_request_prompt_template_id_prompt_template_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_request" ADD CONSTRAINT "ai_review_request_prompt_version_id_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_request" ADD CONSTRAINT "ai_review_request_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_response" ADD CONSTRAINT "ai_review_response_request_id_ai_review_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ai_review_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_response" ADD CONSTRAINT "ai_review_response_document_id_intake_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."intake_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_review_request_document_id_idx" ON "ai_review_request" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ai_review_request_customer_id_idx" ON "ai_review_request" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ai_review_request_status_idx" ON "ai_review_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_review_response_document_id_idx" ON "ai_review_response" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ai_review_response_analyst_review_status_idx" ON "ai_review_response" USING btree ("analyst_review_status");