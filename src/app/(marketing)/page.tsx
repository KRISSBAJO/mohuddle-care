import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Heart, HeartHandshake, MapPin, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";
import { CarePhoto } from "@/components/marketing/CarePhoto";
import { ServiceExplorer } from "@/components/marketing/ServiceExplorer";
import { LandingMotion } from "@/components/marketing/LandingMotion";
import { site } from "@/lib/site";

const steps = [
  ["Let’s connect", "Tell us what matters to you. We listen to your story, your goals, and the support you’re looking for."],
  ["Make it personal", "Together, we build a support plan around your strengths, preferences and everyday life."],
  ["Find your people", "Meet a support team who understands your plan and helps you feel at home."],
  ["Keep moving forward", "As your life changes, your support changes with it. We stay connected along the way."],
];

export default function HomePage() {
  return (
    <div className="landing-page">
      <LandingMotion />
      <section className="care-hero">
        <div className="container-x hero-grid">
          <div className="hero-copy rise">
            <p className="eyebrow"><span className="status-dot" /> A little support. A world of possibility.</p>
            <h1>A fuller life.<br />One <span className="hero-emphasis">milestone</span><br />at a time.</h1>
            <p className="hero-description">A home that feels like yours. A community you belong to. Support that sees the person in you.</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mute">Person-centered care for adults and children with intellectual and developmental disabilities across Middle Tennessee.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="#contact" className="btn-primary">Find your support <ArrowRight className="h-4 w-4" /></Link>
              <Link href="#services" className="hero-text-link">Explore our services <ArrowDown className="h-4 w-4" /></Link>
            </div>
            <div className="hero-assurance"><ShieldCheck className="h-5 w-5" /><span>Rooted in dignity. Built around you.</span></div>
          </div>
          <div className="hero-visual rise rise-2">
            <div className="hero-image-wrap">
              <Image src="/images/care-garden.png" alt="A support professional and two adults sharing a gardening activity at home" fill preload sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
              <div className="hero-image-shade" />
              <div className="hero-photo-caption"><span className="status-dot bg-accent" /> Room to grow. People to grow with.</div>
            </div>
            <div className="hero-note"><span className="hero-note-icon"><HeartHandshake className="h-6 w-6" /></span><div><strong>Your life. Your way.</strong><p>We’re here for the next step.</p></div><Sparkles className="ml-auto h-5 w-5 text-brand" /></div>
            <div className="hero-stamp" aria-hidden="true"><Heart className="h-6 w-6" /><span>PERSON<br />FIRST.<br />ALWAYS.</span></div>
            <p className="image-disclosure">Illustrative imagery</p>
          </div>
        </div>
      </section>
      <div className="community-strip"><div className="container-x flex flex-wrap items-center justify-between gap-5"><p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> Your neighbors in Middle Tennessee</p><div className="flex flex-wrap gap-x-7 gap-y-2 text-xs font-medium text-mute"><span>Davidson County</span><span>Rutherford County</span><span>Williamson County</span><span>& surrounding communities</span></div></div></div>
      <section id="services" className="container-x scroll-mt-24 py-16 lg:py-20">
        <div className="section-intro"><div><p className="eyebrow">Support for real life</p><h2>Find the support<br /><span className="text-brand">that feels right.</span></h2></div><p>Start with what matters to you. Explore nine ways to build independence, connection and a sense of belonging.</p></div>
        <ServiceExplorer />
      </section>
      <section id="everyday-life" className="life-section scroll-mt-24"><div className="container-x">
        <div className="section-intro"><div><p className="eyebrow">A good life is made of moments</p><h2>Small moments.<br /><span className="text-brand">A world of meaning.</span></h2></div><p>A meal made together. Something new to try. A home to come back to. Support belongs in the everyday moments that make life yours.</p></div>
        <div className="life-gallery">
          <div className="life-gallery-item"><CarePhoto src="/images/care-kitchen.png" alt="An adult preparing a meal with a support professional alongside" caption="Independence, one everyday choice at a time." sizes="(max-width: 640px) 100vw, 33vw" /><p><span>01 / AT HOME</span>A little help. A lot more possibility.</p></div>
          <div className="life-gallery-item life-gallery-center"><CarePhoto src="/images/care-art.png" alt="Adults and a support professional enjoying a creative art activity" caption="Room to try something new." sizes="(max-width: 640px) 100vw, 33vw" /><div className="life-gallery-message"><HeartHandshake className="h-6 w-6" /><h3>Your choices.<br />Your people.<br /><span>Your everyday life.</span></h3></div></div>
          <div className="life-gallery-item"><CarePhoto src="/images/care-family.png" alt="A family sharing a book and a relaxed moment together at home" caption="A place to feel connected." sizes="(max-width: 640px) 100vw, 33vw" /><p><span>03 / WITH PEOPLE YOU LOVE</span>Belonging makes a difference.</p></div>
        </div>
      </div></section>
      <section id="why" className="care-story scroll-mt-24"><div className="container-x grid items-center gap-12 lg:grid-cols-2">
        <div className="story-photo"><Image src="/images/care-community.png" alt="Two women sharing a conversation on a neighborhood walk" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /><div className="story-photo-label"><Heart className="h-4 w-4" /> More than care. Connection.</div></div>
        <div><p className="eyebrow">The Milestone difference</p><h2 className="mt-4 text-4xl font-bold leading-[1.1] sm:text-5xl">See the person.<br /><span className="text-brand">Open the possibilities.</span></h2><p className="mt-6 text-base leading-relaxed text-mute">The best support starts with knowing someone. Their favorite routines. Their hopes. What makes them laugh. We build care around these everyday details, because a good life is personal.</p>
          <div className="story-values">{[["Your voice comes first", "Goals and choices belong to the person we support."], ["A place to belong", "Home, work and community life, with the right support alongside."], ["A team in your corner", "People, families and support teams working together."]].map(([title, body]) => <div key={title}><span><Check className="h-4 w-4" /></span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-line bg-white/60 p-5"><h3 className="eyebrow">Our mission</h3><p className="mt-3 text-xs leading-relaxed text-mute">{site.mission}</p></div><div className="rounded-2xl border border-line bg-white/60 p-5"><h3 className="eyebrow">Our vision</h3><p className="mt-3 text-xs leading-relaxed text-mute">{site.vision}</p></div></div>
          <p className="mt-5 text-xs leading-relaxed text-mute">{site.story}</p>
          <Link href="#contact" className="hero-text-link mt-5 inline-flex">Get to know our team <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div></section>
      <section className="container-x py-12"><div className="grid gap-5 rounded-2xl border border-line bg-white p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]"><div><p className="eyebrow">Accountability & dignity</p><h2 className="mt-3 text-2xl font-semibold">Care you can ask questions about.</h2><p className="mt-3 text-xs leading-relaxed text-mute">Milestone lists these state credentials and commits to client privacy, non-discrimination and ethical hiring.</p></div><div className="grid content-center gap-3">{site.credentials.map(credential => <p key={credential} className="flex items-start gap-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{credential}</p>)}<Link href="/privacy" className="hero-text-link text-brand">Privacy & non-discrimination <ArrowRight className="h-4 w-4" /></Link></div></div></section>
      <section id="how" className="care-process scroll-mt-24"><div className="container-x"><div className="section-intro"><div><p className="eyebrow text-accent">A clear path forward</p><h2>Big possibilities.<br />Small first steps.</h2></div><p>Finding support should feel welcoming. Here’s how we move forward, together.</p></div>
        <ol className="process-grid">{steps.map(([title, body], index) => <li key={title}><span className="process-number">0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol><div className="process-bottom"><p>Ready when you are.</p><Link href="#contact" className="btn-accent">Start a conversation <ArrowRight className="h-4 w-4" /></Link></div>
      </div></section>
      <section className="container-x py-16 lg:py-24"><div className="careers-banner careers-banner-photo"><CarePhoto src="/images/care-team.png" alt="Care professionals collaborating around a table" className="callout-photo" caption="Good people. Meaningful work." /><div className="careers-banner-copy"><p className="eyebrow">Do work that matters</p><h2>Someone’s next milestone<br />could start with you.</h2><p>Bring your compassion. Help people build a life they love.</p><Link href="/careers" className="btn-primary mt-6">Explore careers <ArrowRight className="h-4 w-4" /></Link></div></div></section>
      <section id="contact" className="container-x scroll-mt-24 pb-24"><div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div><p className="eyebrow">Your next step starts here</p><h2 className="mt-4 text-4xl font-bold sm:text-5xl">Let’s talk about<br /><span className="text-brand">what’s possible.</span></h2><p className="mt-5 max-w-md text-mute">For yourself, someone you love, or someone you support. Tell us a little about what you’re looking for.</p><a href={site.phoneHref} className="contact-phone"><Phone className="h-6 w-6" />{site.phone}</a><a href={`mailto:${site.email}`} className="text-sm font-semibold text-brand underline underline-offset-4">{site.email}</a><div className="mt-8 flex gap-3 text-sm text-mute"><MapPin className="mt-1 h-5 w-5 shrink-0" /><p>{site.address}<br />{site.cityStateZip}<br /><span className="mt-2 block text-xs">{site.hours}</span></p></div></div><ContactForm />
      </div></section>
    </div>
  );
}

