import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Heart, Search, X } from "lucide-react";

import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import type { CameraMotionId, VideoCameraManifest, VideoCameraMotion } from "./videoCameraManifest";

type CameraTab = "all" | "favorites" | "mine";

type VideoCameraLibraryProps = {
  manifest: VideoCameraManifest;
  onChange: (cameraMotionId: CameraMotionId | null) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  value: CameraMotionId | null;
};

const MEDIA_ROOT = "/video-camera-library/";
const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute("disabled"));
}

export function VideoCameraLibrary({ manifest, onChange, onClose, triggerRef, value }: VideoCameraLibraryProps) {
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const preferredFocusRef = useRef(triggerRef);
  const [tab, setTab] = useState<CameraTab>("all");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<CameraMotionId>>(() => new Set());
  const [pendingId, setPendingId] = useState<CameraMotionId | null>(value);
  const [reduceMotion, setReduceMotion] = useState(false);

  preferredFocusRef.current = triggerRef;

  const stopPreviews = () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    videosRef.current.forEach((video) => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Some browser media implementations reject seeking unloaded clips.
      }
    });
  };

  const dismiss = () => {
    stopPreviews();
    onClose();
    preferredFocusRef.current?.current?.focus();
  };
  const layer = useDismissibleLayer("video-camera-library", { onDismiss: dismiss });

  useEffect(() => {
    layer.openLayer();
    return () => {
      stopPreviews();
    };
  }, [layer.openLayer]);

  useEffect(() => {
    getFocusableElements(layer.ref.current)[0]?.focus();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;
    const sync = () => setReduceMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener?.("change", sync);
    return () => mediaQuery.removeEventListener?.("change", sync);
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return manifest.items.filter((motion) => {
      if (tab === "favorites" && !favorites.has(motion.id)) return false;
      if (tab === "mine") return false;
      return !normalizedQuery || motion.label.toLocaleLowerCase().includes(normalizedQuery) || motion.id.includes(normalizedQuery);
    });
  }, [favorites, manifest.items, query, tab]);

  useEffect(() => {
    if (reduceMotion || tab === "mine") {
      stopPreviews();
      return;
    }

    if (typeof IntersectionObserver === "undefined") return;

    const active = new Set<HTMLVideoElement>();
    const play = (video: HTMLVideoElement) => {
      if (active.size >= 4 || active.has(video)) return;
      active.add(video);
      void video.play().catch(() => {
        active.delete(video);
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          play(video);
        } else {
          active.delete(video);
          video.pause();
          try { video.currentTime = 0; } catch { /* unloaded media */ }
        }
      });
    }, { threshold: 0.25 });
    observerRef.current = observer;
    videosRef.current.forEach((video) => observer.observe(video));
    return () => {
      observer.disconnect();
      observerRef.current = null;
      active.forEach((video) => {
        video.pause();
        try { video.currentTime = 0; } catch { /* unloaded media */ }
      });
    };
  }, [reduceMotion, tab, visibleItems]);

  const selectTab = (nextTab: CameraTab) => {
    setTab(nextTab);
    setQuery("");
  };

  const toggleFavorite = (id: CameraMotionId) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const usePendingMotion = () => {
    onChange(pendingId);
    layer.dismissLayer();
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const focusableElements = getFocusableElements(event.currentTarget);
    if (focusableElements.length === 0) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (!activeElement || !event.currentTarget.contains(activeElement)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <section
        ref={layer.ref as React.RefObject<HTMLElement>}
        aria-label="Camera motion library"
        aria-modal="true"
        className="flex max-h-[min(780px,calc(100vh-24px))] w-full max-w-[1080px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#17171b] text-white shadow-[0_28px_80px_rgba(0,0,0,0.58)]"
        onKeyDown={trapFocus}
        role="dialog"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Camera motion library</h2>
            <p className="mt-0.5 text-[10px] font-medium text-white/45">Choose a motion preset for this video.</p>
          </div>
          <button aria-label="Close camera motion library" className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-white/65 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-300" onClick={() => layer.dismissLayer()} type="button"><X size={18} /></button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <div aria-label="Camera motion categories" className="flex h-[34px] items-center gap-1 rounded-[10px] bg-black/20 p-1" role="tablist">
            <TabButton active={tab === "all"} label="All" onClick={() => selectTab("all")} />
            <TabButton active={tab === "favorites"} label="Favorites" onClick={() => selectTab("favorites")} />
            <TabButton active={tab === "mine"} label="My motions" onClick={() => selectTab("mine")} />
          </div>
          <label className="relative ml-auto flex h-[34px] min-w-[190px] max-w-full flex-1 items-center text-white/45 sm:max-w-[280px]">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5" size={14} />
            <input aria-label="Search camera motions" className="h-full w-full rounded-[10px] border border-white/10 bg-black/20 pl-8 pr-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-sky-300/60" onChange={(event) => setQuery(event.target.value)} placeholder="Search motions" type="search" value={query} />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "mine" ? <EmptyState text="No custom camera motions yet." /> : visibleItems.length === 0 ? <EmptyState text={tab === "favorites" ? "No favorite camera motions yet." : "No matching camera motions."} /> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visibleItems.map((motion) => (
                <CameraCard
                  key={motion.id}
                  favorite={favorites.has(motion.id)}
                  motion={motion}
                  onFavorite={() => toggleFavorite(motion.id)}
                  onSelect={() => setPendingId(motion.id)}
                  reduceMotion={reduceMotion}
                  selected={pendingId === motion.id}
                  videoRef={(video) => {
                    if (video) videosRef.current.set(motion.id, video);
                    else videosRef.current.delete(motion.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <span aria-live="polite" className="min-w-0 flex-1 truncate text-xs font-bold text-white/75">{pendingId ? manifest.items.find((motion) => motion.id === pendingId)?.label ?? pendingId : "No camera motion selected"}</span>
          <button aria-label="Clear selected camera motion" className="h-[38px] rounded-[10px] px-3 text-xs font-bold text-white/65 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-white/25" disabled={pendingId === null} onClick={() => setPendingId(null)} type="button">Clear</button>
          <button aria-label="Use camera motion" className="h-[38px] rounded-[10px] bg-sky-300 px-3 text-xs font-bold text-slate-950 hover:bg-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-100/80" onClick={usePendingMotion} type="button">Use</button>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-selected={active} className={`h-[26px] rounded-[7px] px-2 text-[11px] font-bold ${active ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/85"}`} onClick={onClick} role="tab" type="button">{label}</button>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid min-h-[220px] place-items-center text-center text-xs font-medium text-white/40">{text}</div>;
}

function CameraCard({ favorite, motion, onFavorite, onSelect, reduceMotion, selected, videoRef }: {
  favorite: boolean;
  motion: VideoCameraMotion;
  onFavorite: () => void;
  onSelect: () => void;
  reduceMotion: boolean;
  selected: boolean;
  videoRef: (video: HTMLVideoElement | null) => void;
}) {
  return (
    <article className={`group relative overflow-hidden rounded-lg border bg-black/20 transition ${selected ? "border-sky-300/80 ring-1 ring-sky-300/45" : "border-white/10 hover:border-white/30"}`}>
      <button aria-label={motion.label} className="block w-full text-left focus:outline-none" data-camera-motion-id={motion.id} onClick={onSelect} type="button">
        <div className="relative aspect-video overflow-hidden bg-[#0d0e11]">
          {reduceMotion ? <img alt="" className="h-full w-full object-cover" src={`${MEDIA_ROOT}${motion.poster}`} /> : <video className="h-full w-full object-cover" loop muted playsInline poster={`${MEDIA_ROOT}${motion.poster}`} preload="metadata" ref={videoRef} src={`${MEDIA_ROOT}${motion.preview}`} />}
          {selected ? <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-300 text-slate-950"><Check aria-hidden="true" size={13} /></span> : null}
        </div>
        <span className="block truncate px-2.5 py-2 text-xs font-bold leading-tight text-white/85">{motion.label}</span>
      </button>
      <button aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${motion.label}`} className={`absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-[8px] transition ${favorite ? "bg-rose-400/20 text-rose-200" : "bg-black/35 text-white/55 opacity-0 group-hover:opacity-100 focus:opacity-100"}`} onClick={onFavorite} type="button"><Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} size={14} /></button>
    </article>
  );
}
