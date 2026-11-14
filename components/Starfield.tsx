"use client";

import { useEffect, useRef } from "react";

// Twinkling starfield tinted across the infrared "rainbow" SPHEREx sees.
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#ffffff", "#cfe0ff", "#9fd8ff", "#ffe2b0", "#ffb3a0"];
    let stars: { x: number; y: number; r: number; c: string; p: number; s: number }[] = [];
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.floor((canvas.offsetWidth * canvas.offsetHeight) / 2600);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        r: Math.random() ** 3 * 1.6 + 0.3,
        c: colors[Math.floor(Math.random() * colors.length)],
        p: Math.random() * Math.PI * 2,
        s: 0.5 + Math.random() * 1.5,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const st of stars) {
        ctx.globalAlpha = reduce ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(st.p + (t / 1000) * st.s));
        ctx.fillStyle = st.c;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    draw(0);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
