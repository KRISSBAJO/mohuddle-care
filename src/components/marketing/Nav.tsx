"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { site } from "@/lib/site";
import { Logo } from "./Logo";

const links = [
  { href: "/#services", label: "Services" },
  { href: "/#how", label: "How it works" },
  { href: "/#why", label: "Why Milestone" },
  { href: "/careers", label: "Careers" },
  { href: "/#contact", label: "Contact" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-ground/95 backdrop-blur-md transition-all duration-300 ${
        scrolled ? "border-b border-line shadow-sm" : "border-b border-transparent"
      }`}
    >
      <div className="container-x flex h-[72px] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Milestone home">
          <Logo className="h-9 w-9" />
          <span><span className="block font-display text-2xl font-semibold tracking-tight">Milestone</span><span className="block text-[8px] uppercase tracking-[0.2em] text-mute">Home healthcare service</span></span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {links.map(link => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-mute transition hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/login" className="text-xs font-semibold text-mute">Staff Hub</Link>
          <Link href="/#contact" className="btn-primary btn-sm">Let’s talk <Phone className="h-3.5 w-3.5" /></Link>
        </div>

        <button
          type="button"
          className="rounded-full border border-line bg-white p-2.5 lg:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(value => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-ground lg:hidden">
          <nav className="container-x flex flex-col gap-1 py-4" aria-label="Mobile">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium hover:bg-panel"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2">
              <a href={site.phoneHref} className="btn-ghost flex-1">
                <Phone className="h-4 w-4" /> Call us
              </a>
              <Link href="/login" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                Staff Hub
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
