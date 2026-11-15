"use client";

import { useEffect } from "react";
import "./scroll-reveal.css";

export default function ScrollReveal() {
  useEffect(() => {
    const home = document.querySelector<HTMLElement>(".home");
    if (!home || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;

    const targets = Array.from(home.querySelectorAll<HTMLElement>(
      ".h-stage, .h-split, .h-sub, .h-cards > *, .h-panel, .h-features > *, .h-wide, .h-stats > *, .h-goals > *, .h-facts, .h-project > *, .h-team > *, .h-resources > *, .h-final"
    ));
    const reveal = (element: HTMLElement) => {
      element.classList.remove("scroll-reveal-pending");
      observer.unobserve(element);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) reveal(entry.target as HTMLElement);
      });
    }, { threshold: 0, rootMargin: "0px 0px -36px 0px" });

    targets.forEach((element) => {
      // Leave the initial viewport and restored scroll position visible.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
      element.style.setProperty("--reveal-delay", `${Math.min(index, 3) * 65}ms`);
      element.classList.add("scroll-reveal-item", "scroll-reveal-pending");
      observer.observe(element);
    });

    // Keyboard navigation and in-page links must never land on hidden content.
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(".scroll-reveal-pending");
      if (target) reveal(target);
    };
    const onMotionChange = () => {
      if (motion.matches) targets.forEach(reveal);
    };
    home.addEventListener("focusin", onFocus);
    motion.addEventListener("change", onMotionChange);
    return () => {
      observer.disconnect();
      home.removeEventListener("focusin", onFocus);
      motion.removeEventListener("change", onMotionChange);
      targets.forEach((element) => {
        element.classList.remove("scroll-reveal-item", "scroll-reveal-pending");
        element.style.removeProperty("--reveal-delay");
      });
    };
  }, []);

  return null;
}
