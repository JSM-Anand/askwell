"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Milliseconds to wait before the entrance plays. */
  delay?: number;
};

/** Fades and slides its children in once they scroll into view. Content stays visible without JS. */
export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;

    const onPreferenceChange = () => {
      if (reducedMotion.matches) animation?.cancel();
    };
    reducedMotion.addEventListener("change", onPreferenceChange);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // Read the preference now, not at mount, so a change while the page is open is honored.
        if (reducedMotion.matches) return;
        animation = el.animate(
          [
            { opacity: 0, transform: "translateY(16px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 600, delay, easing: "ease-out", fill: "backwards" },
        );
      },
      { threshold: 0.15 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", onPreferenceChange);
      animation?.cancel();
    };
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
