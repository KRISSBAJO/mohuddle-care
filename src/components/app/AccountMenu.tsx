"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, Building2, Check, ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  role: string;
  agency: string;
  current: string;
  places: { agencyId: string; name: string; role: string }[];
  owner: boolean;
  /* Where the owner console is: admin.<host>, or /owner here. */
  ownerUrl?: string;
  /* Returns the other agency's address when agencies have their own; the browser goes there. */
  switchAgency: (agencyId: string) => Promise<{ url?: string }>;
};

/* Who is signed in and where. Opens the agency switcher when they work for more than one, and the owner console for owners. */
export function AccountMenu({ name, role, agency, current, places, owner, ownerUrl = "/owner", switchAgency }: Props) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const initials = name.split(" ").map(part => part[0]).slice(0, 2).join("");
  const menu = places.length > 1 || owner;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const face = (
    <>
      <div className="hidden text-right sm:block">
        <p className="text-xs font-semibold">{name}</p>
        <p className="mt-1 text-[10px] text-mute"><span className="capitalize">{role}</span> · {agency}</p>
      </div>
      <span className="hub-topbar-avatar">{initials}</span>
    </>
  );
  if (!menu) return <div className="flex items-center gap-3">{face}</div>;

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-haspopup="menu" aria-label={`${name}, ${agency}: switch agency`} className="flex items-center gap-3 rounded-xl px-1.5 py-1 hover:bg-panel">
        {face}
        <ChevronDown className={cn("h-3.5 w-3.5 text-mute transition", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          {places.length > 1 && (
            <div className="p-2">
              <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-mute"><ArrowLeftRight className="h-3.5 w-3.5" /> Switch agency</p>
              {places.map(place => {
                const here = place.agencyId === current;
                return (
                  <button
                    key={place.agencyId}
                    type="button"
                    role="menuitem"
                    disabled={here || moving !== null}
                    onClick={() => {
                      setMoving(place.agencyId);
                      startTransition(async () => {
                        const result = await switchAgency(place.agencyId);
                        if (result?.url) window.location.assign(result.url);
                        else setMoving(null);
                      });
                    }}
                    className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm", here ? "bg-sage-soft/60" : "hover:bg-panel")}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-mute" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{place.name}</span>
                      <span className="block text-[11px] capitalize text-mute">{place.role}</span>
                    </span>
                    {here ? <Check className="h-4 w-4 text-sage" /> : moving === place.agencyId ? <Loader2 className="h-4 w-4 animate-spin text-mute" /> : null}
                  </button>
                );
              })}
            </div>
          )}
          {owner && (
            <Link href={ownerUrl} role="menuitem" className="flex items-center gap-2.5 border-t border-line px-4 py-3 text-sm font-semibold hover:bg-panel">
              <ShieldCheck className="h-4 w-4 text-brand" /> Owner console
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
