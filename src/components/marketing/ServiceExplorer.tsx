"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { services } from "@/lib/site";

const groups = [
  { title: "A place to call home.", label: "Home & belonging", photo: "care-kitchen", alt: "An adult preparing a meal with a support professional", indexes: [1, 2, 6] },
  { title: "Your world, opened up.", label: "Independence & opportunity", photo: "care-art", alt: "Adults enjoying a creative activity together", indexes: [0, 4, 8] },
  { title: "Someone alongside you.", label: "Care & family support", photo: "care-family", alt: "A family sharing a book at home", indexes: [5, 7, 3] },
];

export function ServiceExplorer() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const openLinkedService = () => {
      const slug = window.location.hash.slice(1);
      root.current?.querySelectorAll<HTMLDetailsElement>("details").forEach(detail => {
        if (detail.id === slug) detail.open = true;
      });
    };
    openLinkedService();
    window.addEventListener("hashchange", openLinkedService);
    return () => window.removeEventListener("hashchange", openLinkedService);
  }, []);

  return <div ref={root} className="service-stories">
    {groups.map((group, index) => <article key={group.label} className="service-story">
      <div className="service-story-photo"><Image src={`/images/${group.photo}.png`} alt={group.alt} fill sizes="(max-width: 767px) 100vw, 33vw" className="object-cover" /><span className="service-story-number">0{index + 1}</span><span className="care-photo-disclosure">Illustrative imagery</span></div>
      <p className="service-story-label">{group.label}</p><h3>{group.title}</h3>
      <div className="service-story-list">{group.indexes.map(serviceIndex => {
        const service = services[serviceIndex];
        return <details key={service.slug} id={service.slug} className="service-story-item">
          <summary>{service.name}<Plus className="h-4 w-4 shrink-0" /></summary>
          <div className="service-story-description"><p>{service.short}</p><ul>{service.points.map(point => <li key={point}>{point}</li>)}</ul><Link href="#contact">Let’s talk <ArrowRight className="h-3.5 w-3.5" /></Link></div>
        </details>;
      })}</div>
    </article>)}
    <div className="service-stories-footer"><p>Not sure where to start? We’ll figure it out together.</p><Link href="#contact">Find your support <ArrowRight className="h-4 w-4" /></Link></div>
  </div>;
}
