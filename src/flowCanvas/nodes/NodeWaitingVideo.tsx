import { useEffect, useState } from "react";

export type NodeWaitingVideoKind = "text" | "image" | "video";

type NodeWaitingVideoProps = {
  kind: NodeWaitingVideoKind;
  className?: string;
  fallback?: React.ReactNode;
};

const fallbackLabel: Record<NodeWaitingVideoKind, string> = {
  image: "Image generation in progress",
  text: "Text generation in progress",
  video: "Video generation in progress",
};

export function NodeWaitingVideo({ kind, className, fallback }: NodeWaitingVideoProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setReducedMotion(event.matches);
      if (event.matches) {
        setVideoReady(false);
      }
    };

    updatePreference(mediaQuery);
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  const showVideo = !reducedMotion && !videoFailed;
  const fallbackContent = fallback ?? (
    <div aria-label={fallbackLabel[kind]} data-testid="node-waiting-fallback" role="status" />
  );

  return (
    <div className={className} data-testid="node-waiting-video-container">
      {showVideo ? (
        <video
          autoPlay
          data-testid="node-waiting-video"
          loop
          muted
          onCanPlay={() => setVideoReady(true)}
          onError={() => {
            setVideoFailed(true);
            setVideoReady(false);
          }}
          playsInline
          preload="metadata"
          src={`/node-waiting/${kind}-waiting.mp4`}
        />
      ) : null}
      {!showVideo || !videoReady ? fallbackContent : null}
    </div>
  );
}
