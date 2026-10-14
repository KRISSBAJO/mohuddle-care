"use client";

/* A GET form for list filters. Changing a dropdown applies it at once; the search box applies on Enter. */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
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
          const form = event.currentTarget;
          // A new filter starts again from the first page.
          const page = form.elements.namedItem("page");
          if (page instanceof HTMLInputElement) page.value = "1";
          form.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
