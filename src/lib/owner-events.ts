/* What each owner console action is called on screen. */
export const OWNER_ACTIONS: Record<string, string> = {
  "agency:create": "Created the agency",
  "agency:update": "Changed the profile",
  "agency:off": "Turned the agency off",
  "agency:on": "Turned the agency back on",
  "admin:add": "Added an administrator",
  "admin:link": "Issued a setup link",
  "demo:handled": "Marked a demo request handled",
  "demo:waiting": "Marked a demo request waiting",
  "support:open": "Opened the agency for support",
  "support:close": "Ended a support visit",
  "plan:save": "Saved a plan",
  "billing:rules": "Changed the billing rules",
  "library:handover": "Changed the shift-change library",
  "billing:update": "Changed the plan or status",
  "billing:payment": "Recorded a payment",
  "owner:sign-in": "Signed in",
  "owner:two-factor": "Added an authenticator app",
  "owner:backup-codes": "Made new backup codes",
  "owner:sign-out-others": "Signed out other browsers",
};

export const ownerActionWords = (action: string) => OWNER_ACTIONS[action] ?? action;
