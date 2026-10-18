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
Use a clearly labelled test person/home for signed care notes and care punches. These accounts are
in the live agency; do not attach fictional observations to an actual person's care record. The
automated tests used separate disposable agencies and removed their fixtures, so there is no
pre-existing test shift, test timesheet or test person from those checks to select on a phone.
Do not send test account invitations/password reset mail to these addresses.

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
