# Notes and staff time: Android / iPhone acceptance

Updated 18 October 2026. Automated checks and live HTTP checks pass; physical-phone acceptance
is still pending. No new native build is required. Apply More > Account > Check for updates.

## Accounts

The ten new accounts are in Milestone. Password is the one Kriss specified, shared separately;
no existing staff or owner passwords were changed. Names begin with Test so they are identifiable.

| Email | Staff role | App access | Office approved |
| --- | --- | --- | --- |
| admin@test.vcom | Administrator | Administrator | Yes |
| manager@test.vcom | Residential manager | Coordinator / manager | Yes |
| coordinator@test.vcom | Coordinator | Coordinator / manager | Yes |
| nurse@test.vcom | Nurse | Nurse | No |
| nurse2@test.vcom | Nurse | Nurse | No |
| dsp@test.vcom | Care staff | DSP | No |
| dsp2@test.vcom | Care staff | DSP | No |
| dsp3@test.vcom | Care staff | DSP | No |
| dsp4@test.vcom | Care staff | DSP | No |
| dsp5@test.vcom | Care staff | DSP | No |

Use dsp@test.vcom on Android and manager@test.vcom on iPhone, then swap roles/devices and repeat.
Do not send test account invitations/password reset mail to these addresses.

## Persistent phone practice setup — created 18 October 2026

- Agency: Milestone. Home: **TEST — Phone Practice Home**. Person: **TEST Practice Person**.
- All ten test staff are assigned to that home. Its manager is manager@test.vcom.
- Each staff member has a recent practice shift on 17 October, 4–5 pm Central, for the Notes list,
  and an upcoming shift on 19 October, 9–11 am Central, for schedule testing.
- Seven nurse/DSP accounts additionally have a current practice shift on 18 October, 2:07–8:12 am
  Central. This is a time-bounded setup; after it ends use the next scheduled window or ask to move
  only these labelled test shifts to a fresh testing window.
- The three office-approved accounts have no current care shift, preserving office testing access.
  Their recent care-note practice entry still appears in Notes. A due future care shift will take
  priority over office work according to the normal policy.
- Total: 27 scheduled test shifts. No attendance punches, signed notes, leave requests, completed
  timesheets or real medication orders were created. Shifts alone are not evidence of worked time.
- This fictional home has no GPS point or clinical data. Normal agency location/statements/handover
  rules remain in force; the strict configured office geofence is unchanged.
- The test home has no recurring coverage requirements, so it does not add permanent around-the-clock
  coverage gaps. Scheduled test shifts and unsigned notes can still appear in manager dashboards.

These records are in the live agency. Keep all practice notes/punches on this TEST person/home and
review/exclude test staff from real payroll/EVV/billing exports. Never enter fictional observations
against an actual person's care record. Use Earlier period to inspect/sign an ended test staff
period; no historical worked hours were fabricated for that test. After genuine phone test punches
are recorded, use the normal correction/review flow on those test punches.

## 1. Notes

- Write an unsigned draft with date/time, narrative and selections. Go back: Notes should list it.
- Force-close/reopen, then resume. Confirm the exact text and selections return. Signing must still
  require a fresh confirmation. Repeat offline; reconnect before submission.
- Sign a clearly labelled test note. It should open from Notes / recent notes and stop appearing as
  an unsigned draft. Refresh on the other phone: manager sees it waiting for review.
- Manager returns it with a reason. Refresh on staff phone, open Returned to you, correct it and
  resubmit. Manager sees the correction/history, then approves and locks it.
- Staff can read the approved note but cannot edit it. Repeat with a Community Participation note.
- While a saved correction is open, have the other phone change the record. Reopen/refresh: the
  first phone must flag the older draft and must not silently overwrite the new server version.
- Switch roles/accounts if available: nurses/care staff must not gain manager review rights.

## 2. Staff time and manager decisions

- My work > My schedule and time: confirm schedule, punch history and timesheet are for that login.
  Move between weeks/periods quickly, then refresh; the latest selection should remain displayed.
- From an existing test punch, request a correction with a clear reason. Close/reopen before
  sending to verify draft recovery. Send; manager sees it under More > Management > Approvals.
- A different manager approves. Refresh staff view: request says Approved and punch times change.
  Try another request that manager declines with a reason; staff should see that reason.
- Time off: choose a type, dates and hours, save a draft, reopen, then send. Manager approves or
  declines; staff sees the result. A future approved request can be cancelled by its requester.
- For an ended test pay period with closed punches, enter the full Test staff name and sign.
  Manager returns it with a reason, staff checks and re-signs, manager approves. Approved/locked
  periods must not offer signing or editing. The current unfinished period may correctly block signing.
- Switch agency/account while an approvals load is slow: old names/decisions must not remain visible.

## 3. Clock and office checks

- Today shows clock controls before management tools. Clock in/out and start/end a break using
  test records, then verify the same times in My schedule and time.
- Office clock-in is enabled only for the three approved test accounts. Nurses and DSPs must not
  have access. Kriss's existing personal staff record was not given office access.
- Approved staff must be at the saved office, allow accurate GPS, describe the work and confirm
  required statements. Away from the office or without accurate GPS, office starts must be refused.
- The configured 100 m point is a street-address estimate; verify it on-site before relying on the
  boundary. A due care shift takes priority over office work.
- After office clock-out, a different manager reviews the hours and records what was checked.
  The same person cannot review their own office punch; unreviewed office hours block payroll approval.

Record device, account, step and exact message for any failure. Do not include passwords, PINs,
recovery codes or actual patient details in screenshots. A passed server check does not establish
keyboard, calendar picker, saved-draft or GPS behavior on either physical phone.
