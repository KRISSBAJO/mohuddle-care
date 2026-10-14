"use client";

import { useEffect, useRef } from "react";

/*
 * A GET form for list filters. Choosing from a dropdown applies it at once; the search box applies
 * on Enter. Works with native selects and with the Select component.
 */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const element = form.current;
    if (!element) return;
    const apply = () => {
      // A new filter starts again from the first page.
      const page = element.elements.namedItem("page");
      if (page instanceof HTMLInputElement) page.value = "1";
      element.requestSubmit();
    };
    element.addEventListener("select-change", apply);
    return () => element.removeEventListener("select-change", apply);
  }, []);

  return (
    <form
      ref={form}
      method="get"
      className={className}
      role="search"
      onSubmit={event => {
        // Keep addresses short: leave out empty fields and fields still at their default.
        const fields = [...event.currentTarget.elements].filter(
          (el): el is HTMLInputElement | HTMLSelectElement => el instanceof HTMLInputElement || el instanceof HTMLSelectElement,
        );
        const skipped = fields.filter(el => el.name && (el.value === "" || el.value === el.dataset.default));
        skipped.forEach(el => (el.disabled = true));
        setTimeout(() => skipped.forEach(el => (el.disabled = false)));
      }}
      onChange={event => {
        const target = event.target as HTMLElement;
        if (target.tagName === "SELECT") {
          const page = event.currentTarget.elements.namedItem("page");
          if (page instanceof HTMLInputElement) page.value = "1";
          event.currentTarget.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
