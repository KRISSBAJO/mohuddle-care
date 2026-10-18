export type SelectionOption = string | readonly [string, string];
export function selectionItems(options: readonly SelectionOption[], query = "") {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return options.map(option => typeof option === "string" ? { id: option, label: option } : { id: option[0], label: option[1] }).filter(item => words.every(word => item.label.toLocaleLowerCase().includes(word)));
}
