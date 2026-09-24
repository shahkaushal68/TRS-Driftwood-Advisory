CREATE TABLE "manual_review" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"reviewed_by" text,
	"review_source" text DEFAULT 'manual' NOT NULL,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"executive_summary" text,
	"document_quality_review" text,
	"readiness_findings" text,
	"evidence_gaps" text,
	"human_validation_questions" text,
	"suggested_next_steps" text,
	"draft_analyst_finding" text,
	"limitations" text,
	"evidence_sufficiency" text,
	"reviewer_confidence" text,
	"primary_color_indicator" text,
	"recommended_analyst_action" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "manual_review_document_id_uniq" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "manual_review" ADD CONSTRAINT "manual_review_document_id_intake_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."intake_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review" ADD CONSTRAINT "manual_review_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_review_document_id_idx" ON "manual_review" USING btree ("document_id");