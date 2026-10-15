"use client";

import { useEffect, useRef } from "react";

/*
 * Motion for the Mohuddle site, with no library: things marked data-reveal rise into place as they
 * scroll into view, numbers marked data-count count up, the hero stage tilts with the pointer, and a
 * thin bar shows how far down the page you are. Without JavaScript, or for people who ask their
 * device for less motion, everything simply shows.
 */
export function Motion() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    root.classList.add("mh-motion");

    const countUp = (element: HTMLElement) => {
      const target = Number(element.dataset.count);
      if (!Number.isFinite(target)) return;
      const suffix = element.dataset.suffix ?? "";
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 1400);
        const eased = 1 - Math.pow(1 - t, 3);
        element.textContent = `${Math.round(target * eased)}${suffix}`;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const seen = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.classList.add("is-in");
          if (element.dataset.count) countUp(element);
          element.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
          seen.unobserve(element);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach(element => seen.observe(element));

    // The hero stage leans a little toward the pointer.
    const stage = document.querySelector<HTMLElement>("[data-tilt]");
    const tilt = (event: PointerEvent) => {
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - (box.left + box.width / 2)) / box.width;
      const y = (event.clientY - (box.top + box.height / 2)) / box.height;
      stage.style.setProperty("--tilt-x", `${(-y * 6).toFixed(2)}deg`);
      stage.style.setProperty("--tilt-y", `${(x * 8).toFixed(2)}deg`);
    };
    const untilt = () => {
      stage?.style.setProperty("--tilt-x", "0deg");
      stage?.style.setProperty("--tilt-y", "0deg");
    };
    if (stage && window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("pointermove", tilt, { passive: true });
      document.addEventListener("pointerleave", untilt);
    }

    // Scroll progress, and a shadow on the header once the page moves.
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = root.scrollHeight - window.innerHeight;
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
        root.classList.toggle("mh-scrolled", window.scrollY > 8);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      seen.disconnect();
      window.removeEventListener("pointermove", tilt);
      document.removeEventListener("pointerleave", untilt);
      window.removeEventListener("scroll", onScroll);
      root.classList.remove("mh-motion", "mh-scrolled");
    };
  }, []);

  return <div ref={bar} className="mh-progress" aria-hidden="true" />;
}
