import { useEffect, useMemo, useRef, useState } from "react";

import { isLowEndDevice } from "../../utils/performance";
import { LANDING_FILM_MANIFEST } from "./landingFilmManifest";

function getSignals() {
  if (typeof window === "undefined") return { reducedMotion: false, lowEndDevice: false, saveData: false };
  const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
  return {
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    lowEndDevice: isLowEndDevice(),
    saveData: Boolean(connection.connection?.saveData),
  };
}

export function useFilmStage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [signals, setSignals] = useState(getSignals);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(max-width: 640px)").matches ?? false));
  const [paused, setPaused] = useState(false);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);
  const ratios = useRef(new Map<number, number>());
  const variant = useMemo(() => (Math.floor(Math.random() * 3) === 0 ? "a" : Math.floor(Math.random() * 2) === 0 ? "b" : "c") as "a" | "b" | "c", []);

  useEffect(() => {
    const update = () => setSignals(getSignals());
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 640px)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = sectionsRef.current.indexOf(entry.target as HTMLElement);
        if (index >= 0) ratios.current.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      let bestIndex = activeIndex;
      let bestRatio = 0.6;
      ratios.current.forEach((ratio, index) => {
        if (ratio >= bestRatio) { bestIndex = index; bestRatio = ratio; }
      });
      if (bestRatio >= 0.6) setActiveIndex(bestIndex);
    }, { threshold: [0, 0.6, 0.75, 1] });
    sectionsRef.current.forEach((section) => section && observer.observe(section));
    return () => observer.disconnect();
  }, [activeIndex]);

  return { activeIndex, chapters: LANDING_FILM_MANIFEST, mobile, paused, sectionsRef, setActiveIndex, setPaused, signals, variant };
}
