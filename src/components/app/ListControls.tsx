import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

type Query = Record<string, string | number>;

/* A link to a list page with some settings changed. Defaults are left out to keep addresses short. */
export function listHref<Q extends Query>(base: string, defaults: Q, query: Q, changes: Partial<Q>) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    if (String(next[key]) !== String(defaults[key])) params.set(key, String(next[key]));
  }
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

/* A sortable table heading. Clicking the active column reverses the order. */
export function SortHeader({ active, dir, href, children, className }: { active: boolean; dir: "asc" | "desc"; href: string; children: React.ReactNode; className?: string }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} className={className}>
      <Link href={href} className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}>
        {children} <Icon className="h-3 w-3" aria-hidden="true" />
      </Link>
    </th>
  );
}

function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = [...new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return wanted.flatMap((n, index) => (index > 0 && n - wanted[index - 1] > 1 ? ["gap" as const, n] : [n]));
}

/* The bar under a list: result count, page size and page numbers. */
export function Pagination({
  page,
  pages,
  total,
  per,
  sizes,
  note,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  per: number;
  sizes: readonly number[];
  note?: string;
  hrefFor: (changes: { page?: number; per?: number }) => string;
}) {
  const first = total === 0 ? 0 : (page - 1) * per + 1;
  const last = Math.min(total, page * per);
  return (
    <nav className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pages">
      <p className="text-xs text-mute">
        {total === 0 ? "No results" : `Showing ${first}–${last} of ${total}`}
        {note && ` · ${note}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-xs text-mute">Per page</span>
        {sizes.map(size => (
          <Link key={size} href={hrefFor({ per: size, page: 1 })} aria-current={per === size ? "true" : undefined} className={`chip ${per === size ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink"}`}>
            {size}
          </Link>
        ))}
        {pages > 1 && (
          <>
            <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
            {page > 1 ? (
              <Link href={hrefFor({ page: page - 1 })} className="btn-ghost btn-sm px-2" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Link>
            ) : (
              <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
            )}
            {pageWindow(page, pages).map((item, index) =>
              item === "gap" ? (
                <span key={`gap-${index}`} className="px-1 text-mute">…</span>
              ) : (
                <Link key={item} href={hrefFor({ page: item })} aria-current={item === page ? "page" : undefined} className={`chip min-w-8 justify-center ${item === page ? "bg-brand text-white" : "bg-panel text-mute hover:text-ink"}`}>
                  {item}
                </Link>
              ),
            )}
            {page < pages ? (
              <Link href={hrefFor({ page: page + 1 })} className="btn-ghost btn-sm px-2" aria-label="Next page"><ChevronRight className="h-4 w-4" /></Link>
            ) : (
              <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
