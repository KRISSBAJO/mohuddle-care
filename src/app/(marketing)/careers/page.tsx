import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Download, ExternalLink, HeartHandshake, Phone, Users } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";
import { CarePhoto } from "@/components/marketing/CarePhoto";
import { applicationForms, applicationRequirements, openings, site } from "@/lib/site";

export const metadata: Metadata = { title: "Careers & foster parenting" };

export default function CareersPage() {
  return (
    <>
      <section className="care-hero">
        <div className="container-x grid items-center gap-10 lg:grid-cols-2">
          <div><p className="eyebrow">Careers & foster parenting</p><h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Bring compassion.<br /><span className="hero-emphasis">Build possibility.</span></h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-mute">The everyday support you give can open a world of possibility for someone else.</p><p className="mt-5 max-w-lg text-sm leading-relaxed text-mute">Milestone welcomes responsible, caring people and offers training, support and opportunities to grow in the care field.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="#applications" className="btn-primary">Application forms <ArrowRight className="h-4 w-4" /></Link><Link href="#opportunities" className="btn-ghost">Explore opportunities</Link></div></div>
          <div className="relative"><div className="story-photo"><Image src="/images/care-community.png" alt="Two women enjoying a conversation on a neighborhood walk" fill preload sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /><div className="story-photo-label"><HeartHandshake className="h-4 w-4" /> Connection starts with people.</div></div><p className="mt-2 text-right text-[9px] text-mute">Illustrative imagery</p></div>
        </div>
      </section>

      <section id="opportunities" className="container-x scroll-mt-24 py-16 lg:py-20">
        <div className="section-intro"><div><p className="eyebrow">Find your place</p><h2>Meaningful work.<br /><span className="text-brand">A personal difference.</span></h2></div><p>Explore roles with Milestone. Our team can share current openings, locations and schedules.</p></div>
        <div className="opportunity-layout"><CarePhoto src="/images/care-art.png" alt="People taking part in a creative day activity with a support professional" className="opportunity-photo" caption="Be part of the moments that matter." /><div className="grid gap-4 sm:grid-cols-2">{openings.map(role => <article key={role.title} className="card flex flex-col p-6"><Users className="h-5 w-5 text-brand" /><h3 className="mb-6 mt-5 text-xl font-semibold leading-snug">{role.title}</h3><Link href="#applications" className="mt-auto flex items-center justify-between border-t border-line pt-4 text-xs font-semibold text-brand">Employment application <ArrowRight className="h-4 w-4" /></Link></article>)}</div></div>
      </section>

      <section id="applications" className="scroll-mt-24 bg-panel py-16 lg:py-20"><div className="container-x">
        <div className="section-intro"><div><p className="eyebrow">Your next step</p><h2>Choose your path.<br /><span className="text-brand">Take your next step.</span></h2></div><p>Open or download the application for the path that interests you. Call the office for current application and submission instructions.</p></div>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {[
            { key: "employment" as const, title: "Employment", description: "For Direct Support Professionals, Program Coordinators, Residential Managers and Nurses.", pages: 14, href: applicationForms.employment, image: "/images/care-team.png", alt: "A team of care professionals sharing ideas and working together", caption: "Bring your strengths. Find your people." },
            { key: "foster" as const, title: "Foster parenting", description: "For people interested in opening their home to someone who needs a stable, supportive family setting.", pages: 4, href: applicationForms.foster, image: "/images/care-family.png", alt: "Parents and a child sharing a warm family moment at home", caption: "Make room for a new chapter." },
          ].map(path => <article key={path.key} id={path.key === "foster" ? "foster-parenting" : "employment"} className="application-card card scroll-mt-24"><CarePhoto src={path.image} alt={path.alt} caption={path.caption} className="application-photo" /><div className="p-6 sm:p-8"><span className="chip bg-sky text-brand-deep">{path.pages} pages · PDF</span><h3 className="mt-5 text-3xl font-semibold">{path.title}</h3><p className="mt-4 text-sm leading-relaxed text-mute">{path.description}</p><h4 className="mt-7 text-xs font-semibold uppercase tracking-wider text-mute">Requirements published by Milestone</h4><ul className="mt-4 space-y-3">{applicationRequirements[path.key].map(requirement => <li key={requirement} className="flex items-start gap-2.5 text-sm"><Check className="mt-1 h-4 w-4 shrink-0 text-brand" />{requirement}</li>)}</ul><div className="mt-8 flex flex-wrap gap-3"><a href={path.href} download className="btn-primary btn-sm" aria-label={`Download ${path.title.toLowerCase()} application PDF`}><Download className="h-4 w-4" /> Download application</a><a href={path.href} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" aria-label={`Open ${path.title.toLowerCase()} application PDF`}><ExternalLink className="h-4 w-4" /> Open PDF</a></div></div></article>)}
        </div>
        <div className="mt-7 flex flex-col justify-between gap-5 rounded-2xl border border-line bg-white/60 p-6 sm:flex-row sm:items-center"><div><h3 className="text-base font-semibold">Questions before you apply?</h3><p className="mt-2 text-xs leading-relaxed text-mute">Our interest form starts a conversation. It does not replace the employment or foster-parent application.</p></div><a href={site.phoneHref} className="btn-ghost btn-sm"><Phone className="h-4 w-4" /> {site.phone}</a></div>
      </div></section>

      <section className="container-x py-16 lg:py-20"><div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]"><div><p className="eyebrow">Start a conversation</p><h2 className="mt-4 text-4xl font-semibold">Let’s find<br /><span className="text-brand">your next step.</span></h2><p className="mt-5 text-sm leading-relaxed text-mute">Tell us which role or path interests you. Keep this message to your contact details and general questions; the official applications are available above.</p><p className="mt-7 text-sm leading-relaxed text-mute">{site.address}<br />{site.cityStateZip}<br /><span className="mt-2 block">{site.hours}</span><span className="mt-2 block">Fax: {site.fax}</span></p></div><ContactForm kind="careers" interests={[...openings.map(role => role.title), "Foster parenting"]} /></div></section>
    </>
  );
}
