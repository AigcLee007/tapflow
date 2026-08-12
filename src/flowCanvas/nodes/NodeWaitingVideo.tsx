import { useEffect, useRef, useState } from "react";

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setReducedMotion(true);
      return;
    }

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

  const handleCanPlay = async () => {
    try {
      await videoRef.current?.play();
      setVideoReady(true);
    } catch {
      setVideoFailed(true);
      setVideoReady(false);
    }
  };

  return (
    <div className={className} data-testid="node-waiting-video-container">
      {showVideo ? (
        <video
          aria-hidden="true"
          autoPlay
          data-testid="node-waiting-video"
          hidden={!videoReady}
          loop
          muted
          onCanPlay={handleCanPlay}
          onError={() => {
            setVideoFailed(true);
            setVideoReady(false);
          }}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={`/node-waiting/${kind}-waiting.mp4`}
        />
      ) : null}
      {!showVideo || !videoReady ? fallbackContent : null}
    </div>
  );
}
