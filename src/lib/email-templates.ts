/*
 * The words of each email Mohuddle sends. Plain text first, with a simple HTML copy. Short, plain
 * sentences: these go to support staff, families and guardians on their phones.
 */

export type EmailContent = { subject: string; text: string; html: string };

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function compose(subject: string, lines: string[], action: { label: string; url: string }, footer: string): EmailContent {
  const text = [...lines, "", `${action.label}: ${action.url}`, "", footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6f1;font-family:Arial,Helvetica,sans-serif;color:#173e35">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
${lines.map(line => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${escape(line)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#173e35;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${escape(action.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#5b6b7a;word-break:break-all">${escape(action.url)}</p>
<p style="margin:28px 0 0;font-size:12px;color:#5b6b7a">${escape(footer)}</p>
</div></body></html>`;
  return { subject, text, html };
}

/* A new login: choose a password. */
export const inviteEmail = (input: { agency: string; name: string; url: string; expires: string }) =>
  compose(
    `Your ${input.agency} login for Mohuddle`,
    [`Hi ${input.name.split(" ")[0]},`, `${input.agency} has set up your Mohuddle login. Open the link below and choose a password. Then you can sign in on any phone or computer.`, `The link works once, until ${input.expires}.`],
    { label: "Choose your password", url: input.url },
    `If you were not expecting this, you can ignore it. Questions? Ask the office at ${input.agency}.`,
  );

/* A password reset, asked for by the person or by their office. */
export const resetEmail = (input: { agency: string; name: string; url: string; expires: string }) =>
  compose(
    "Reset your Mohuddle password",
    [`Hi ${input.name.split(" ")[0]},`, "Open the link below to choose a new Mohuddle password. Your old password works until you do.", `The link works once, until ${input.expires}.`],
    { label: "Choose a new password", url: input.url },
    "If you did not ask for this, you can ignore it: nothing changes.",
  );

/* Documents the office has asked a staff member for. */
export const documentRequestEmail = (input: { agency: string; name: string; title: string; url: string; expires: string }) =>
  compose(
    `${input.agency}: ${input.title}`,
    [`Hi ${input.name.split(" ")[0]},`, `${input.agency} has asked you for some documents: ${input.title}.`, `Open the link below to send or sign them from your phone. It works until ${input.expires}.`],
    { label: "Send your documents", url: input.url },
    `Questions? Ask the office at ${input.agency}.`,
  );
