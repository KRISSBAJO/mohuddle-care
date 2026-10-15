/*
 * The help guide Ask Mohuddle answers "how do I" questions from. Short, plain steps for each feature.
 * Keep it true to the app: when a feature changes, change its article here.
 */

export type HelpArticle = { id: string; title: string; keywords: string[]; steps: string[]; href?: string; link?: string };

export const HELP: HelpArticle[] = [
  { id: "clock-in", title: "Clock in", keywords: ["clock in", "start shift", "punch in", "arrive", "location", "late"], steps: ["Open My time clock and tap Clock in, or say \"clock me in\".", "Allow your location when asked; it is only read at that moment.", "Read and tick the last shift's handover, and any statements your agency asks for.", "You can clock in a few minutes before your shift starts. Late or away from the home is flagged for your manager."], href: "/app/clock/in", link: "Clock in" },
  { id: "clock-out", title: "Clock out", keywords: ["clock out", "end shift", "punch out", "leave", "handover", "going home"], steps: ["Finish your daily notes and record any doses first.", "Tap Clock out, or say \"clock me out\" to see what is left.", "Write the handover for the next shift and tick the checks.", "Type your name to sign. Leaving early or late asks for a reason."], href: "/app/clock/out", link: "Clock out" },
  { id: "breaks", title: "Breaks", keywords: ["break", "meal", "lunch", "rest", "pause"], steps: ["While clocked in, tap Meal break or Rest break on My time clock, or say \"start my meal break\".", "Meal breaks are unpaid; rest breaks are paid. Their lengths are set by your agency.", "You get a reminder before the break ends. Tap End break, or say \"I'm back\"."], href: "/app/clock", link: "My time clock" },
  { id: "correction", title: "Fix a punch", keywords: ["forgot", "correction", "wrong time", "missed punch", "fix"], steps: ["Forgot to clock in or out, or a time is wrong? Open My time clock and choose Fix a punch.", "Give the right time and a reason. Your manager approves it."], href: "/app/clock/correction", link: "Fix a punch" },
  { id: "timesheet", title: "Timesheets", keywords: ["timesheet", "hours", "pay period", "sign timesheet", "overtime", "payroll"], steps: ["At the end of each pay period you get a reminder to sign your timesheet.", "Check your hours, then sign. Your manager approves, then payroll locks the period.", "Overtime is counted per workweek."], href: "/app/clock/timesheets", link: "My timesheets" },
  { id: "time-off", title: "Time off", keywords: ["time off", "leave", "vacation", "pto", "sick", "holiday", "balance"], steps: ["Open My time off, choose the type, the days and the hours, and send.", "Your manager approves it and finds cover for your shifts.", "Your leave balance shows on the same page. Paid types may use your balance."], href: "/app/clock/time-off", link: "My time off" },
  { id: "daily-note", title: "Write a daily note", keywords: ["daily note", "shift note", "log", "write note", "documentation"], steps: ["Open Daily notes and choose New log, or say \"write a note for\" and the person's name.", "Choose your shift and fill each section. Plan goals show how many times they were worked on this week.", "Write the summary, tick that it is accurate, and sign. Notes are due within the time your agency sets after the shift."], href: "/app/daily-logs/new", link: "New daily note" },
  { id: "speak-note", title: "Speak your note", keywords: ["speak", "voice", "dictate", "scribe", "talk", "microphone", "record"], steps: ["On a new daily note, tap Start speaking and talk through the shift, like telling the next shift.", "Fix any wrong words, then tap Fill in the note. Filled parts are highlighted.", "Check every highlighted part, add anything missing, and sign it yourself. The recording is never saved."], href: "/app/daily-logs/new", link: "New daily note" },
  { id: "community-note", title: "Community Participation note", keywords: ["community", "outing", "cp note", "activity", "trip", "billable"], steps: ["For an outing or activity in the community, open Daily notes and choose Community Participation note.", "Enter the start and end times; the billable time is worked out for you.", "Describe the location, activity, how it was chosen and learning opportunities, then sign."], href: "/app/community-notes/new", link: "New Community Participation note" },
  { id: "note-review", title: "Notes sent back", keywords: ["sent back", "returned", "review", "approve", "fix note", "resubmit"], steps: ["A reviewer may send a note back with what to fix. You get a notification.", "Open Daily notes, then Review (or Sent back), and choose Fix it.", "Make the changes and resubmit. Every edit is recorded."], href: "/app/daily-logs?view=review", link: "Review" },
  { id: "mar", title: "Give and record medication", keywords: ["mar", "medication", "dose", "meds", "given", "refused", "held", "missed"], steps: ["Open Medications to see what is due, late and given at your home.", "Record each dose as given, refused or held, with a note when needed.", "Late doses are flagged and the right people are told."], href: "/app/medications", link: "Medications" },
  { id: "incident", title: "Report an incident", keywords: ["incident", "fall", "injury", "reportable", "event", "tier", "didd", "accident"], steps: ["From the person's page choose Report incident, or say \"report an incident for\" and their name. Their details fill in for you.", "Choose the event type, when and where it happened, what you did, and who was told.", "Tier 1 events count down to the DIDD deadline; your manager is told straight away."], href: "/app/incidents/new", link: "Report an incident" },
  { id: "weight", title: "Record a weight", keywords: ["weight", "bmi", "height", "weigh", "scale"], steps: ["Open the person's Health tab and choose Record weight.", "Enter the date and weight in pounds; BMI is worked out from their height.", "Weights outside their suggested range, or changing fast, are flagged to the nurse."] },
  { id: "notifications", title: "Phone notifications", keywords: ["notification", "alerts", "phone", "push", "reminder", "sound"], steps: ["Tap the bell, then Turn on, and allow notifications.", "On iPhone, first tap Share, Add to Home Screen, and open Mohuddle from there.", "You then get shift, break and other reminders even when Mohuddle is closed."] },
  { id: "signed-out", title: "Why was I signed out?", keywords: ["signed out", "logged out", "idle", "session", "timeout", "shared device", "tablet"], steps: ["To keep people's information safe, you are signed out after a while without using the app. A \"Still there?\" box shows first.", "Everyone signs in again after a set number of hours.", "On a shared device, such as a home tablet, tick \"This is a shared device\" when you sign in; it signs out when you clock out."] },
  { id: "documents", title: "Documents and signing", keywords: ["document", "sign", "signature", "form", "upload", "credential", "expire"], steps: ["Open My documents to see what you have been asked to read, fill in or sign.", "Sign on screen; your signature is added to the PDF.", "Credentials with an expiry date send reminders before they run out."], href: "/app/my-documents", link: "My documents" },
  { id: "schedule", title: "Your schedule", keywords: ["schedule", "shift", "rota", "when", "swap", "open shift"], steps: ["Your shifts show on My time clock and the Schedule.", "Say \"when is my next shift\" any time.", "Ask your manager to change a shift; time off you ask for frees your shifts for cover."], href: "/app/schedule", link: "Schedule" },
  { id: "ask", title: "What Ask Mohuddle can do", keywords: ["ask", "assistant", "voice", "commands", "what can you do"], steps: ["Say or type: \"clock me in\", \"start my meal break\", \"I'm back\", \"clock me out\".", "Ask: \"when is my next shift\", \"who's on\", \"how many hours this week\", \"what's due\", \"my leave balance\".", "Or: \"write a note for Aisha\", \"report an incident for Sam\", \"open the MAR\", \"how do I fix a punch\"."] },
];

const STOP = new Set(["how", "do", "i", "a", "an", "the", "to", "is", "what", "where", "why", "can", "my", "me", "of", "in", "on", "for", "it", "does", "there", "about", "tell", "explain", "help", "with", "and", "are", "when", "happens", "need"]);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(word => word && !STOP.has(word));

/* The articles that best answer a question, best first. Phrases in the keywords count most. */
export function searchHelp(question: string, limit = 2): HelpArticle[] {
  const asked = words(question);
  const text = ` ${asked.join(" ")} `;
  if (!asked.length) return [];
  const scored = HELP.map(article => {
    let score = 0;
    for (const keyword of article.keywords) if (text.includes(` ${words(keyword).join(" ")} `)) score += keyword.includes(" ") ? 4 : 3;
    const title = words(article.title);
    for (const word of asked) {
      if (title.includes(word)) score += 2;
      else if (article.steps.some(step => words(step).includes(word))) score += 0.5;
    }
    return { article, score };
  });
  return scored.filter(item => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.article);
}
