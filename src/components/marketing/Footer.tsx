import Link from "next/link";
import { services, site } from "@/lib/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line bg-ink text-white">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span className="font-display text-xl font-bold">Milestone</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">{site.description}</p>
          <p className="mt-6 text-xs text-white/50">{site.credentials.join(" · ")}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">Services</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {services.map(service => (
              <li key={service.slug}>
                <Link href={`/#${service.slug}`} className="text-white/85 hover:text-white">
                  {service.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">Milestone</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/#how" className="text-white/85 hover:text-white">How support begins</Link></li>
            <li><Link href="/#why" className="text-white/85 hover:text-white">Why families choose us</Link></li>
            <li><Link href="/careers" className="text-white/85 hover:text-white">Careers and foster parenting</Link></li>
            <li><Link href="/privacy" className="text-white/85 hover:text-white">Privacy and non-discrimination</Link></li>
            <li><Link href="/login" className="text-white/85 hover:text-white">Staff Hub sign in</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">Visit us</h3>
          <address className="mt-4 space-y-2 text-sm not-italic text-white/85">
            <p>{site.address}<br />{site.cityStateZip}</p>
            <p><a href={site.phoneHref} className="hover:text-white">{site.phone}</a></p>
            <p>Fax: {site.fax}</p>
            <p><a href={`mailto:${site.email}`} className="hover:text-white">{site.email}</a></p>
            <p className="text-white/60">{site.hours}</p>
          </address>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {site.legalName}. All rights reserved.</p>
          <p>Serving {site.serviceAreas.slice(0, 3).join(", ")} and surrounding counties.</p>
        </div>
      </div>
    </footer>
  );
}
