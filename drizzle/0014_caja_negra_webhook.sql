CREATE TABLE "webhook_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"phone_number_id" text,
	"wa_message_id" text,
	"sender" text,
	"sender_kind" text NOT NULL,
	"type" text NOT NULL,
	"wa_timestamp" timestamp,
	"has_referral" boolean NOT NULL,
	"referral_source_id" text,
	"referral_source_type" text,
	"referral_headline" text,
	"decision" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_log" ADD CONSTRAINT "webhook_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_log_received_idx" ON "webhook_log" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_log_sender_idx" ON "webhook_log" USING btree ("sender");