CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "daily_logs_person_day" ON "daily_logs" USING btree ("individual_id","log_date");--> statement-breakpoint
CREATE INDEX "daily_logs_staff_day" ON "daily_logs" USING btree ("staff_id","log_date");--> statement-breakpoint
CREATE INDEX "daily_logs_shift" ON "daily_logs" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "incidents_person" ON "incidents" USING btree ("individual_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_home" ON "incidents" USING btree ("home_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_status" ON "incidents" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE INDEX "individuals_home" ON "individuals" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "med_admin_person_time" ON "med_administrations" USING btree ("individual_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "med_admin_due" ON "med_administrations" USING btree ("scheduled_for") WHERE status = 'due';--> statement-breakpoint
CREATE INDEX "medications_person" ON "medications" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "plan_goals_person" ON "plan_goals" USING btree ("individual_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shifts_home_start" ON "shifts" USING btree ("home_id","starts_at");--> statement-breakpoint
CREATE INDEX "shifts_staff_start" ON "shifts" USING btree ("staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "shifts_start" ON "shifts" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "staff_home" ON "staff" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee" ON "tasks" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "tasks_home" ON "tasks" USING btree ("home_id","status");--> statement-breakpoint
CREATE INDEX "tasks_status_due" ON "tasks" USING btree ("status","due_at");