CREATE TABLE "executive_report" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"report_version" integer NOT NULL,
	"report_status" text DEFAULT 'generating' NOT NULL,
	"master_prompt_id" text,
	"master_prompt_version_id" text,
	"provider" text,
	"model" text,
	"generated_report_markdown" text,
	"source_review_ids" jsonb,
	"generated_by_user_id" text,
	"generated_at" timestamp,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"published_by_user_id" text,
	"published_at" timestamp,
	"last_updated_by_user_id" text,
	"last_updated_at" timestamp,
	"generation_error_message" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "executive_report_customer_id_version_uniq" UNIQUE("customer_id","report_version")
);
--> statement-breakpoint
ALTER TABLE "prompt_template" ALTER COLUMN "trs_domain_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_template" ALTER COLUMN "evidence_category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_master_prompt_id_prompt_template_id_fk" FOREIGN KEY ("master_prompt_id") REFERENCES "public"."prompt_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_master_prompt_version_id_prompt_version_id_fk" FOREIGN KEY ("master_prompt_version_id") REFERENCES "public"."prompt_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_report" ADD CONSTRAINT "executive_report_last_updated_by_user_id_user_id_fk" FOREIGN KEY ("last_updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executive_report_customer_id_idx" ON "executive_report" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "executive_report_status_idx" ON "executive_report" USING btree ("report_status");