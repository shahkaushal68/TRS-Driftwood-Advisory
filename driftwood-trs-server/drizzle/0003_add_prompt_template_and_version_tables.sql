CREATE TABLE "prompt_template" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_name" text NOT NULL,
	"prompt_description" text,
	"trs_domain_id" text NOT NULL,
	"evidence_category_id" text NOT NULL,
	"prompt_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "prompt_template_domain_category_uniq" UNIQUE("trs_domain_id","evidence_category_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_version" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_template_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" text NOT NULL,
	"prompt_content" text NOT NULL,
	"output_format" text DEFAULT 'markdown' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"change_summary" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_by_user_id" text,
	"activated_at" timestamp,
	"archived_by_user_id" text,
	"archived_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "prompt_version_template_version_number_uniq" UNIQUE("prompt_template_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "prompt_template" ADD CONSTRAINT "prompt_template_active_version_id_prompt_version_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."prompt_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_template" ADD CONSTRAINT "prompt_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_template" ADD CONSTRAINT "prompt_template_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_prompt_template_id_prompt_template_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_activated_by_user_id_user_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_template_domain_category_idx" ON "prompt_template" USING btree ("trs_domain_id","evidence_category_id");--> statement-breakpoint
CREATE INDEX "prompt_template_status_idx" ON "prompt_template" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prompt_version_template_id_idx" ON "prompt_version" USING btree ("prompt_template_id");--> statement-breakpoint
CREATE INDEX "prompt_version_is_active_idx" ON "prompt_version" USING btree ("is_active");