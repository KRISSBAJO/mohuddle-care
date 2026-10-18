/*
 * Website pages that have a screen in the phone app, for links in Ask Mohuddle answers and for
 * tapping a notification. Null means the page is only on the website. Team and incident screens
 * are for coordinators and administrators.
 */
export function phoneScreenFor(href: string, manager: boolean): string | null {
  if (!href) return null;
  const url = new URL(href, "http://phone");
  const person = url.searchParams.get("individual");
  const parts = url.pathname.split("/").filter(Boolean);
  const id = /^[0-9a-f-]{36}$/.test(parts[2] ?? "") ? parts[2] : null;
  switch (url.pathname) {
    case "/app":
      return "/today";
    case "/app/clock":
    case "/app/clock/in":
    case "/app/clock/out":
      return "/clock";
    case "/app/daily-logs/new":
      return person ? `/note?person=${person}` : "/notes";
    case "/app/community-notes/new":
      return "/community-note";
    case "/app/daily-logs":
      return "/notes";
    case "/app/incidents/new":
      return person ? `/report?person=${person}` : "/report";
    case "/app/individuals":
      return "/people";
    case "/app/appointments":
      return "/appointments";
    case "/app/medications":
      return "/meds";
    case "/app/schedule":
      return manager ? "/manager-schedule" : "/my-time";
    case "/app/clock/time-off":
      return "/my-time?view=leave";
    case "/app/clock/correction":
      return "/my-time?view=punches";
    case "/app/clock/timesheets":
      return "/my-time?view=sheet";
    case "/app/tasks":
      return "/tasks";
    case "/app/my-documents":
      return "/documents";
    case "/app/time":
      return manager ? "/team" : null;
    case "/app/chat": {
      const chat = url.searchParams.get("c");
      return chat && /^[0-9a-f-]{36}$/.test(chat) ? `/conversation?id=${chat}` : "/chat";
    }
  }
  if (parts[1] === "clock" && parts[2] === "timesheets" && /^\d{4}-\d{2}-\d{2}$/.test(parts[3] ?? "")) return `/my-time?view=sheet&period=${parts[3]}`;
  if (parts[1] === "appointments" && id) return `/appointment?id=${id}`;
  if (parts[1] === "daily-logs" && id) return `/note-record?kind=daily&id=${id}`;
  if (parts[1] === "community-notes" && id) return `/note-record?kind=community&id=${id}`;
  if (parts[1] === "individuals" && id) return `/person?id=${id}`;
  if (parts[1] === "tasks" && id) return `/task?id=${id}`;
  if (parts[1] === "incidents" && id) return manager ? `/incident?id=${id}` : null;
  return null;
}
