/* "As needed: for pain over 4 out of 10 · at least 4 hours apart · up to 4 in 24 hours" */
export function prnSummary(med: { prnUse: string; prnMinHours: number | null; prnMaxPerDay: number | null }) {
  return [
    `As needed: ${med.prnUse.charAt(0).toLowerCase()}${med.prnUse.slice(1)}`,
    med.prnMinHours ? `at least ${med.prnMinHours} ${med.prnMinHours === 1 ? "hour" : "hours"} apart` : null,
    med.prnMaxPerDay ? `up to ${med.prnMaxPerDay} in 24 hours` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
