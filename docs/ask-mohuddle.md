# Ask Mohuddle

A button on every app page (or Ctrl+J). Staff type, or tap the microphone and speak. It answers
from their own data, opens pages, explains how things work, and does clock actions after a yes.

## What it understands

| Say or type | What happens |
| --- | --- |
| "Clock me in" | A card with the shift, any unread handovers to read and tick, and the required statements. "Clock in now" reads the location once and uses the normal clock-in action, with all its rules. |
| "Start my meal break", "take a 15 minute break", "start my break" | Asks which break if unclear, then starts it. |
| "I'm back", "end my break" | Ends the break after a yes. |
| "Clock me out" | Lists the notes still to write and doses not recorded, with buttons, then the clock-out page (handover, checks and signature stay on that page). |
| "When is my next shift?", "Who's on?", "How many hours this week?", "What's due?", "My leave balance" | Answers from their own records. Staff see who is on at their own home; managers see every home. |
| "Write a note for Aisha", "Report an incident for Sam" | Finds the person by name and opens the form for them. |
| "Open the MAR", "take me to my timesheets" | Opens the page. |
| "How do I fix a punch?" | Answers from the help guide in `src/lib/help.ts`. |

## How it decides

1. Plain rules in `src/lib/assistant.ts` handle the requests above instantly. Questions that start
   with how, where or why are help, so "how do I clock in" never clocks anyone in.
2. If the rules do not fit and the local model is already loaded, it picks one of the same kinds
   (it never acts, and never invents a person). If the model is not loaded, the help guide answers
   at once and the model starts loading for next time.
3. Actions are always cards that wait for a yes. The existing server actions do the work.

Voice uses the same speech engine as the note scribe, listening for names of people, staff and
homes. It stops by itself after a short pause. Replies can be read aloud with the speaker button,
using the device's own voice; nothing leaves the device for that.

Admins switch it on or off under Settings, Daily notes ("Ask Mohuddle").
