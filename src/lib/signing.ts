/*
 * Reading a document to sign: sections from the template text, the values filled in, and the
 * fingerprint of exactly what the signer saw. Pure, so the server and the browser agree.
 */

export type Section = { heading: string; text: string };

/* "# Heading" lines start sections. Text before the first heading is an untitled first section. */
export function sections(body: string): Section[] {
  const result: Section[] = [];
  let current: Section | null = null;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^#\s+(.+)$/);
    if (heading) {
      if (current) result.push(current);
      current = { heading: heading[1].trim(), text: "" };
    } else {
      current ??= { heading: "", text: "" };
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current) result.push(current);
  return result.map(section => ({ ...section, text: section.text.trim() })).filter(section => section.heading || section.text);
}

export function fill(body: string, values: { name: string; date: string; agency: string }) {
  return body.replace(/\{\{\s*name\s*\}\}/g, values.name).replace(/\{\{\s*date\s*\}\}/g, values.date).replace(/\{\{\s*agency\s*\}\}/g, values.agency);
}

/* Initials from a full name: "Jamal R. Carter" gives "JRC". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]!.toUpperCase())
    .join("")
    .slice(0, 4);

/* Plain characters for the standard PDF font, which cannot draw curly quotes or long dashes. */
export const pdfSafe = (text: string) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\n -ÿ]/g, "");
