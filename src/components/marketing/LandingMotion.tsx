"use client";

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    let observer: IntersectionObserver | undefined;
    const start = () => {
      if (preference.matches) return;
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const siblings = Array.from(element.parentElement?.children ?? []);
          const delay = Math.min(siblings.indexOf(element), 3) * 95;
          const animation = element.animate([
            { opacity: 0, transform: "translateY(38px)", filter: "blur(5px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          ], { duration: 850, delay, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
          animations.add(animation);
          void animation.finished.then(() => animations.delete(animation)).catch(() => {});
          observer?.unobserve(element);
        }
      }, { threshold: .12 });
      document.querySelectorAll(".landing-page .section-intro, .landing-page .service-story, .landing-page .life-gallery-item, .landing-page .story-photo, .landing-page .story-values > div, .landing-page .process-grid > li, .landing-page .careers-banner, .landing-page #contact > div > div").forEach(element => observer?.observe(element));
    };
    const stop = () => { observer?.disconnect(); animations.forEach(animation => animation.cancel()); animations.clear(); };
    const change = () => { stop(); start(); };
    start();
    preference.addEventListener("change", change);
    return () => { stop(); preference.removeEventListener("change", change); };
  }, []);
  return <div className="landing-scroll-progress" aria-hidden="true" />;
}
