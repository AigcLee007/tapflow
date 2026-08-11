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
  const [blockedVideos, setBlockedVideos] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      video.playbackRate = dialogOpen ? 0.35 : 1;
      if (index === stage.activeIndex && !stage.paused && !failedVideos.has(index) && !blockedVideos.has(index)) {
        const playback = video.play();
        playback?.catch(() => {
          setBlockedVideos((current) => new Set(current).add(index));
          stage.setPaused(true);
        });
      }
      else video.pause();
    });
  }, [blockedVideos, dialogOpen, failedVideos, stage.activeIndex, stage.paused, stage.setPaused]);

  const scrollToChapter = (index: number) => {
    stage.setActiveIndex(index);
    stage.sectionsRef.current[index]?.scrollIntoView({ behavior: stage.signals.reducedMotion ? "auto" : "smooth" });
  };

  const handlePlayback = (index: number) => {
    if (blockedVideos.has(index)) {
      setBlockedVideos((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
      stage.setPaused(false);
      return;
    }
    stage.setPaused(!stage.paused);
  };

  return (
    <main className="cinematic-auth-home" data-transition-ms={getFilmPlaybackPolicy(stage.signals).transitionMs}>
      <nav className="cinematic-auth-home__nav" aria-label="首页导航">
        <button aria-label="返回首页" className="cinematic-auth-home__brand" type="button" onClick={() => scrollToChapter(0)}><BrandMark size="compact" showCaption /></button>
        <button className="cinematic-auth-home__login" type="button" onClick={onOpenAuth}><LogIn aria-hidden="true" size={16} />登录</button>
      </nav>
      <div className="cinematic-auth-home__rail" aria-label="章节导航">
        {stage.chapters.map((chapter, index) => <button aria-current={index === stage.activeIndex ? "true" : undefined} aria-label={chapter.label} className="cinematic-auth-home__rail-item" key={chapter.id} onClick={() => scrollToChapter(index)} type="button">{chapter.label}</button>)}
      </div>
      {stage.chapters.map((chapter, index) => {
        const distance = Math.abs(index - stage.activeIndex) === 0 ? "active" : Math.abs(index - stage.activeIndex) === 1 ? "adjacent" : "distant";
        const policy = getFilmPlaybackPolicy(stage.signals, distance);
        const desktopPoster = getLandingFilmUrl(chapter.id, stage.variant, "poster", undefined, "desktop");
        const mobilePoster = getLandingFilmUrl(chapter.id, stage.variant, "poster", undefined, "mobile");
        const failed = failedVideos.has(index);
        const blocked = blockedVideos.has(index);
        return <section aria-label={chapter.label} className="cinematic-auth-home__chapter" data-active={index === stage.activeIndex ? "true" : "false"} key={chapter.id} ref={(node) => { stage.sectionsRef.current[index] = node; }} role="region">
          <picture><source media="(max-width: 640px)" srcSet={mobilePoster} /><img alt="" className="cinematic-auth-home__poster" data-testid="landing-film-poster" src={desktopPoster} /></picture>
          {policy.renderVideo && !failed ? <video aria-hidden="true" className="cinematic-auth-home__video" data-testid="landing-film-video" loop muted onError={() => { setFailedVideos((current) => new Set(current).add(index)); if (index === stage.activeIndex) stage.setPaused(true); }} playsInline poster={desktopPoster} preload={policy.preload} ref={(node) => { videos.current[index] = node; }}>
            <source media="(max-width: 640px)" src={getLandingFilmUrl(chapter.id, stage.variant, "video", undefined, "mobile")} type="video/mp4" />
            <source src={getLandingFilmUrl(chapter.id, stage.variant, "video", undefined, "desktop")} type="video/mp4" />
          </video> : null}
          <div className="cinematic-auth-home__shade" />
          <div className="cinematic-auth-home__content"><p>{String(index + 1).padStart(2, "0")}</p><h1>{chapter.title}</h1><span>{chapter.description}</span>{index === stage.chapters.length - 1 ? <button className="cinematic-auth-home__workspace" type="button" onClick={onEnterWorkspace}>进入工作区</button> : null}</div>
          {index === stage.activeIndex && policy.renderVideo && !failed ? <button aria-label={blocked ? "重试播放背景视频" : stage.paused ? "播放背景视频" : "暂停背景视频"} className="cinematic-auth-home__playback" type="button" onClick={() => handlePlayback(index)}>{blocked || stage.paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}</button> : null}
        </section>;
      })}
    </main>
  );
}
