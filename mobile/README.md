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
- More: account, switching agency, sign-out.
