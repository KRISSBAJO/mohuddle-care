"use client";

import { Select, type SelectOption } from "@/components/app/Select";

export type { SelectOption };

/* The Select with its search box always on, for long lists such as staff and people. */
export function SearchSelect(props: Omit<React.ComponentProps<typeof Select>, "searchable">) {
  return <Select {...props} searchable />;
}
