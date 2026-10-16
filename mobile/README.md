# Mohuddle phone app

The Mohuddle app for care staff on shift. One app for every agency. Built with Expo (React Native), so the same code makes the iPhone and Android apps.

## Run it

1. Start the website first (it serves the phone API at `/api/v1`), on port 3400.
2. In this folder: `npm install`, then `npm run web` for a browser preview at http://localhost:8098, or `npm start` and scan the code with Expo Go on a phone.
3. A real phone cannot reach `localhost`. Set `EXPO_PUBLIC_API_URL` to the computer's address on the same Wi-Fi, such as `http://192.168.1.20:3400`, and start the website so it listens on that address.

Checks: `npx tsc --noEmit` and `npx expo lint`.

## How it works

- Sign-in: `POST /api/v1/auth/sign-in` returns a token. The app keeps it in the phone's secure storage and sends it as `Authorization: Bearer`. It is an ordinary Mohuddle session with the phone's name in `sessions.device`, so the same rules apply, and an admin can sign out a lost phone from the staff member's Login & employment tab.
- Someone who works for several agencies chooses one at sign-in and can switch in More.
- Lock: after the agency's `phone_lock_minutes` away, the app locks. It opens with the app PIN, with fingerprint or face when the agency allows it and the person turned it on, or with the password. The PIN is checked on the phone (it works with no signal); only a salted hash is stored, and after `phone_pin_attempts` wrong PINs the app signs out.
- The PIN length (6, 4 or either), fingerprint and face unlock, wrong tries allowed, lock time and sign-in length are agency settings on the website (Settings, Staff and logins). Nothing about them is fixed in the app.
- Every screen reads from a JSON route under `src/app/api/v1` that calls a server function the website can use too (see `src/server/mobile`).

## Agreed scope

Care staff first: Today, clock in and out, notes with Speak your note, medicines, incidents with photos, tasks, a person's key facts (view only), documents, notifications and Ask Mohuddle. Managers second. Setup, settings, pay, exports and the owner console stay on the website.

Medicines with no signal: regular scheduled doses can be recorded offline and are checked for doubles when sent. "As needed" and controlled medicines need a signal, so the latest record is seen first.

## Built so far

- Sign-in, agency choice, PIN, lock and unlock, sign-out.
- Today: the shift, doses due, notes owed, tasks, handovers and the people at the home.
- Clock in and out (`/api/v1/clock`), with breaks. The rules live in `src/server/time-clock.ts` on the website, shared with the website's own clock: location check (no location never blocks; the office is told), tick statements, handovers to read, the clock-out handover and ticks, notes and doses left undone, leaving early or staying late, and signing with the full name. Punches need a signal for now; saving a punch on the phone with no signal comes later.
- Notes: recent shifts and who still needs a note, and the shift note itself (`/api/v1/notes`, `/api/v1/notes/form`), laid out from what each person's note asks (sections, plan goals, the agency's own questions, the hourly timeline). Saving goes through `src/server/daily-notes.ts`, shared with the website.
- Speak your note: the phone records an m4a, `/api/v1/scribe/transcribe?encoded=1` turns it into words (the speech worker decodes it) and `/api/v1/scribe/draft` fills the empty parts of the note. Recordings are not kept. Needs a real phone to test the microphone.
- The lock covers the app instead of replacing it, so a half-written note survives the lock.
- Medicines (`/api/v1/meds`, `/api/v1/meds/record`): today's round at your home, plus anything still not recorded from the last day. Given, Refused, Missed or Held, with the same rule as the website (`src/server/medication-round.ts`): a dose is recorded once, and never before it is due. With no signal a regular dose is saved in the phone's secure storage (`src/lib/outbox.ts`) with the time it was given, and sent when the signal is back; if someone recorded it meanwhile, the phone says who and when instead of recording it twice. Controlled medicines (marked on the website's medicine form) need a signal. As-needed (PRN) medicines are listed with their limits (`/api/v1/meds/as-needed`, `/api/v1/meds/effect`): a reason is required, the server refuses a dose too soon after the last or over the daily most (the medicine row is locked while checking), they always need a signal, and how the dose worked is recorded afterwards (agency setting prn_effect_minutes).
- Report (`/api/v1/incidents`, `/api/v1/incidents/form`, `/api/v1/incidents/{id}/photos`): who, when, what kind (the state's event types, with the tier deadline), what happened, injury, what you did, and photos from the camera or library. Filing goes through `src/server/incident-report.ts`, shared with the website's Reportable Event Form; the office completes the rest of the form on the website. Photos are stored privately (`src/server/incident-photos.ts`) and shown on the website's incident page through `/api/incidents/photos/{id}`. Needs a signal; what was typed stays if sending fails.
- People: tap a person on Today for their key facts (`/api/v1/people/{id}`): allergies first, how to support them, contacts to call, medicines, plan goals and what is coming up. View only, not kept on the phone.
- Tasks (`/api/v1/tasks`, `/api/v1/tasks/{id}`, `.../done`, `.../comments`): from Today or More. Finish with a note, or talk about it; whoever is involved is told. Shared with the website in `src/server/tasks.ts`.
- Documents (`/api/v1/documents`, `/api/v1/documents/sign/{itemId}`, `/api/v1/documents/sign`, `/api/v1/documents/upload`): what the agency asked for, from More. Uploads: take a photo or choose a file. Signing: read each part and initial it, then sign by typing your name in a handwriting font or drawing it; the server draws the images (`src/server/docs/signature-image.ts`, resvg, the same fonts as the website, copied into `assets/fonts`) and signs through `src/server/docs/sign-request.ts`, shared with the website. Documents built from a PDF with placed fields are signed on the website.
- Ask Mohuddle (`/api/v1/assistant`, from the Ask button on Today and from More): type, or tap the microphone and speak (`/api/v1/scribe/transcribe?mode=assistant`; it stops after a pause). The website's assistant answers (`src/server/assistant.ts`); `src/server/mobile/assistant.ts` turns its website links into app screens where the app has one, and marks the rest as website links. Breaks start and end from the answer with a tap; a clock-in opens the clock screen, which shows the handover and checks the location. Answers can be read aloud (expo-speech), switched on per phone. Shown only when the agency's plan includes it and Settings has it on.
- More: account, Ask Mohuddle, My tasks, My documents, switching agency, sign-out.

### For managers (coordinators and administrators)

- Team tab (`/api/v1/team`, shown only when `me.user.canManage`): who needs a call now (no-shows, late, forgotten clock-outs, clocked in away from the home) with a call button, what is waiting for a decision, new incidents with the state reporting deadline, and who is on shift at each home. The numbers come from the website's `liveBoard` (`src/server/queries/timeclock.ts`); the phone shapes are in `src/server/mobile/team.ts`.
- Waiting for you (`/api/v1/team/approvals`): time off, punch fixes, signed timesheets and flagged punches. Decisions go to `/api/v1/team/time-off/{id}`, `/team/corrections/{id}`, `/team/timesheets` and `/team/punches/{id}`, which call `src/server/time-approvals.ts`, the same functions the website's Time page actions call. Turning something down needs a note to the staff member.
- Incident (`/api/v1/team/incidents/{id}`): what happened, the deadline, photos (`/api/v1/incidents/photos/{id}`) and the timeline; a manager can start the review and add follow-up notes (`src/server/incident-follow-up.ts`, shared with the website). Changing details, filing with the state and closing stay on the website.
