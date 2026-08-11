import React, { useEffect, useRef, useState } from "react";
import { LogIn, Pause, Play } from "lucide-react";

import { BrandMark } from "../../app/brand/BrandMark";
import { getFilmPlaybackPolicy } from "./filmPlaybackPolicy";
import { getLandingFilmUrl } from "./landingFilmManifest";
import { useFilmStage } from "./useFilmStage";
import "./cinematicAuthHome.css";

type FilmStageProps = { dialogOpen?: boolean; onEnterWorkspace: () => void; onOpenAuth: () => void };

export function FilmStage({ dialogOpen = false, onEnterWorkspace, onOpenAuth }: FilmStageProps) {
  const stage = useFilmStage();
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [failedVideos, setFailedVideos] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      video.playbackRate = dialogOpen ? 0.35 : 1;
      if (index === stage.activeIndex && !stage.paused && !failedVideos.has(index)) {
        const playback = video.play();
        playback?.catch(() => undefined);
      }
      else video.pause();
    });
  }, [dialogOpen, failedVideos, stage.activeIndex, stage.paused]);

  return (
    <main className="cinematic-auth-home" data-transition-ms={getFilmPlaybackPolicy(stage.signals).transitionMs}>
      <nav className="cinematic-auth-home__nav" aria-label="首页导航">
        <button aria-label="返回首页" className="cinematic-auth-home__brand" type="button" onClick={() => stage.setActiveIndex(0)}><BrandMark size="compact" showCaption /></button>
        <button className="cinematic-auth-home__login" type="button" onClick={onOpenAuth}><LogIn aria-hidden="true" size={16} />登录</button>
      </nav>
      <div className="cinematic-auth-home__rail" aria-label="章节导航">
        {stage.chapters.map((chapter, index) => <button aria-current={index === stage.activeIndex ? "true" : undefined} aria-label={chapter.label} className="cinematic-auth-home__rail-item" key={chapter.id} onClick={() => stage.sectionsRef.current[index]?.scrollIntoView({ behavior: stage.signals.reducedMotion ? "auto" : "smooth" })} type="button">{chapter.label}</button>)}
      </div>
      {stage.chapters.map((chapter, index) => {
        const distance = Math.abs(index - stage.activeIndex) === 0 ? "active" : Math.abs(index - stage.activeIndex) === 1 ? "adjacent" : "distant";
        const policy = getFilmPlaybackPolicy(stage.signals, distance);
        const poster = getLandingFilmUrl(chapter.id, stage.variant, "poster");
        return <section aria-label={chapter.label} className="cinematic-auth-home__chapter" data-active={index === stage.activeIndex ? "true" : "false"} key={chapter.id} ref={(node) => { stage.sectionsRef.current[index] = node; }} role="region">
          <img alt="" className="cinematic-auth-home__poster" data-testid="landing-film-poster" src={poster} />
          {policy.renderVideo && !failedVideos.has(index) ? <video aria-label={`${chapter.label} 背景视频`} className="cinematic-auth-home__video" data-testid="landing-film-video" loop muted onError={() => setFailedVideos((current) => new Set(current).add(index))} playsInline poster={poster} preload={policy.preload} ref={(node) => { videos.current[index] = node; }} src={getLandingFilmUrl(chapter.id, stage.variant, "video")} /> : null}
          <div className="cinematic-auth-home__shade" />
          <div className="cinematic-auth-home__content"><p>{String(index + 1).padStart(2, "0")}</p><h1>{chapter.title}</h1><span>{chapter.description}</span>{index === stage.chapters.length - 1 ? <button className="cinematic-auth-home__workspace" type="button" onClick={onEnterWorkspace}>进入工作区</button> : null}</div>
          {index === stage.activeIndex && policy.renderVideo ? <button aria-label={stage.paused ? "播放背景视频" : "暂停背景视频"} className="cinematic-auth-home__playback" type="button" onClick={() => stage.setPaused(!stage.paused)}>{stage.paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}</button> : null}
        </section>;
      })}
    </main>
  );
}
