/*
 * Spreadsheet (CSV) text from rows. Every cell is quoted, and a cell starting with = + - or @ gets a
 * leading quote mark so a spreadsheet shows it as text instead of running it as a formula.
 */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  // The byte-order mark makes Excel read the file as UTF-8, so names with accents survive.
  return "﻿" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
