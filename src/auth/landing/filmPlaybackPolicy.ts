export type FilmDeviceSignals = { reducedMotion: boolean; lowEndDevice: boolean; saveData: boolean };
export type FilmDistance = "active" | "adjacent" | "distant";

export function getFilmPlaybackPolicy(signals: FilmDeviceSignals, distance: FilmDistance = "distant") {
  const renderVideo = !signals.reducedMotion && !signals.lowEndDevice && !signals.saveData;
  return {
    renderVideo,
    autoplay: renderVideo,
    preload: renderVideo ? (distance === "active" ? "auto" : distance === "adjacent" ? "metadata" : "none") : "none",
    transitionMs: signals.reducedMotion ? 0 : 600,
  } as const;
}
