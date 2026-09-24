ALTER TABLE "intake_document" ADD COLUMN "reset_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "reset_reason" text;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "requested_correction" text;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "reset_by_user_id" text;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "reset_by_name" text;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "intake_document" ADD COLUMN "reset_due_date" timestamp;--> statement-breakpoint
ALTER TABLE "intake_document" ADD CONSTRAINT "intake_document_reset_by_user_id_user_id_fk" FOREIGN KEY ("reset_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;