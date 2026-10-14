ALTER TABLE "note_requirements" ADD COLUMN "follow_up_on" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD COLUMN "follow_up_prompt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_requirements" ADD COLUMN "follow_up_docs" jsonb DEFAULT '[]'::jsonb NOT NULL;;--> statement-breakpoint
INSERT INTO "note_requirements" ("scope", "kind", "enabled", "required", "label", "field_type", "help", "sort_order", "follow_up_on", "follow_up_prompt", "follow_up_docs") VALUES
('all', 'item', false, true, 'Community participation (CP) provided', 'yes_no', 'Did they take part in a community activity as written in their plan?', 10, 'Yes', 'Where did you go, what did they do, and for how long?', '["CP activity log"]'::jsonb),
('all', 'item', false, true, 'Wrap-around support provided', 'yes_no', 'Support given outside the usual routine, such as an extra outing or a visit at home.', 20, 'Yes', 'Describe the wrap-around support and who asked for it.', '[]'::jsonb),
('all', 'item', false, true, 'All daily notes completed for this shift', 'yes_no', 'A note for every person you supported on this shift.', 30, 'No', 'Which notes are missing, and why?', '[]'::jsonb),
('all', 'item', false, true, 'Peak overlap staffing met', 'yes_no', 'Two or more staff on during the busy hours, as the plan requires.', 40, 'No', 'Who was missing, and how was the gap covered?', '[]'::jsonb),
('all', 'item', false, true, 'In the home at 11:59 pm', 'yes_no', 'Was the person at home at midnight?', 50, 'No', 'Where were they, who was with them, and when did they come home?', '[]'::jsonb),
('all', 'item', false, true, 'Behaviour data (ABC) collected', 'yes_no', 'Antecedent, behaviour and consequence, for behaviours in their support plan.', 60, 'Yes', 'Summarise what happened before, during and after.', '["ABC data sheet"]'::jsonb),
('all', 'item', false, true, 'Weight charted', 'yes_no', 'Weighed and written on the weight chart, if due today.', 70, 'No', 'Why was the weight not charted?', '[]'::jsonb),
('all', 'item', false, true, 'Doctor or medical visit today', 'yes_no', 'Any appointment with a doctor, dentist, therapist or clinic.', 80, 'Yes', 'Who did they see, and what was the outcome?', '["Doctor encounter form","Appointment documented"]'::jsonb),
('all', 'item', false, true, 'Incident occurred', 'yes_no', 'Anything that must be reported: an injury, a fall, a medication error, a police contact.', 90, 'Yes', 'Briefly describe what happened and what you did.', '["Incident report"]'::jsonb);
