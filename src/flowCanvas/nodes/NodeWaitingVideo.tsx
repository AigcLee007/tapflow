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
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      playAttemptRef.current += 1;
      videoRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    playAttemptRef.current += 1;
    videoRef.current?.pause();
    setVideoFailed(false);
    setVideoReady(false);
  }, [kind]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setReducedMotion(event.matches);
      if (event.matches) {
        playAttemptRef.current += 1;
        videoRef.current?.pause();
        setVideoReady(false);
      }
    };

    updatePreference(mediaQuery);
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  const showVideo = !reducedMotion && !videoFailed;
  const fallbackContent = fallback ?? (
    <div aria-label={fallbackLabel[kind]} className="node-waiting-video-fallback" data-testid="node-waiting-fallback" role="status">
      <span aria-hidden="true" className="node-waiting-video-fallback__dot" />
      Generating...
    </div>
  );

  const handleCanPlay = async () => {
    const video = videoRef.current;
    if (!video || video.canPlayType("video/mp4") === "") {
      setVideoFailed(true);
      return;
    }
    const attempt = ++playAttemptRef.current;
    try {
      await video.play();
      if (!mountedRef.current || attempt !== playAttemptRef.current || reducedMotion) return;
      setVideoReady(true);
    } catch {
      if (!mountedRef.current || attempt !== playAttemptRef.current) return;
      setVideoFailed(true);
      setVideoReady(false);
    }
  };

  return (
    <div className={className} data-testid="node-waiting-video-container">
      {showVideo ? (
        <video
          aria-hidden="true"
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
