import { useEffect, useState, type CSSProperties } from "react";

import {
  correctVideoGenerationParams,
  createSafeDefaultVideoCapabilities,
} from "./videoGenerationCapabilities";
import { VideoAspectRatioGrid } from "./VideoAspectRatioGrid";
import { VideoSegmentedControl } from "./VideoSegmentedControl";
import { VIDEO_UI_COPY } from "./videoUiCopy";
import type {
  VideoCount,
  VideoGenerationCapabilities,
  VideoGenerationParamsV1,
  VideoResolution,
} from "./videoTypes";

type VideoParameterPanelProps = {
  capabilities?: VideoGenerationCapabilities | null;
  onChange: (params: VideoGenerationParamsV1) => void;
  value: VideoGenerationParamsV1;
};

const RESOLUTIONS: readonly VideoResolution[] = ["480P", "720P", "1080P", "4K"];
const COUNTS: readonly VideoCount[] = [1, 2, 4];
const UNSUPPORTED_BY_MODEL = "当前模型不支持此选项";
const UNSUPPORTED_AUDIO = "当前模型不支持生成音频";

export function VideoParameterPanel({ capabilities, onChange, value }: VideoParameterPanelProps) {
  const routeCapabilitiesConfirmed = Boolean(capabilities?.confirmedByRoute);
  const safeCapabilities = createSafeDefaultVideoCapabilities();
  const effectiveCapabilities = routeCapabilitiesConfirmed ? capabilities! : safeCapabilities;
  const [durationInput, setDurationInput] = useState(String(value.durationSeconds));
  const [durationCorrectionMessage, setDurationCorrectionMessage] = useState<string | null>(null);
  const [audioHelpOpen, setAudioHelpOpen] = useState(false);

  useEffect(() => {
    setDurationInput(String(value.durationSeconds));
  }, [value.durationSeconds]);

  const applyChange = (next: VideoGenerationParamsV1) => {
    onChange(correctVideoGenerationParams(next, effectiveCapabilities).params);
  };

  const applyDurationChange = (nextDuration: number, reportExistingCorrection = false) => {
    const corrected = correctVideoGenerationParams(
      { ...value, durationSeconds: nextDuration },
      effectiveCapabilities,
    ).params;
    const correctedCurrent = correctVideoGenerationParams(value, effectiveCapabilities).params;
    setDurationInput(String(corrected.durationSeconds));
    setDurationCorrectionMessage(
      corrected.durationSeconds === nextDuration
        && (!reportExistingCorrection || correctedCurrent.durationSeconds === value.durationSeconds)
        ? null
        : `已按当前模型能力调整为 ${corrected.durationSeconds} 秒`,
    );
    onChange(corrected);
  };

  const commitDuration = () => {
    const parsed = Number(durationInput);
    applyDurationChange(Number.isFinite(parsed) ? parsed : value.durationSeconds);
  };

  const resolutionOptions = RESOLUTIONS.map((resolution) => ({
    disabled: routeCapabilitiesConfirmed && !effectiveCapabilities.resolutions.includes(resolution),
    disabledReason: UNSUPPORTED_BY_MODEL,
    label: resolution,
    value: resolution,
  }));
  const audioUnsupported = routeCapabilitiesConfirmed && !effectiveCapabilities.supportsAudio;
  const durationSpan = effectiveCapabilities.maxDurationSeconds - effectiveCapabilities.minDurationSeconds;
  const durationProgress = durationSpan > 0
    ? Math.min(
      100,
      Math.max(
        0,
        ((value.durationSeconds - effectiveCapabilities.minDurationSeconds) / durationSpan) * 100,
      ),
    )
    : 0;
  const countOptions = COUNTS.map((count) => ({
    disabled: routeCapabilitiesConfirmed && count > effectiveCapabilities.maxCount,
    disabledReason: UNSUPPORTED_BY_MODEL,
    label: `${count} 个`,
    value: count,
  }));

  return (
    <div aria-label="视频参数内容" className="w-full max-w-[500px] space-y-4 text-white">
      <ParameterSection label={VIDEO_UI_COPY.aspectRatio}>
        <VideoAspectRatioGrid
          allowedRatios={routeCapabilitiesConfirmed ? effectiveCapabilities.aspectRatios : undefined}
          onChange={(aspectRatio) => applyChange({ ...value, aspectRatio })}
          value={value.aspectRatio}
        />
      </ParameterSection>

      <ParameterSection label="清晰度">
        <VideoSegmentedControl
          ariaLabel="清晰度"
          onChange={(resolution) => applyChange({ ...value, resolution })}
          options={resolutionOptions}
          value={value.resolution}
        />
      </ParameterSection>

      <ParameterSection label="视频时长">
        <div aria-label="视频时长控制" className="flex items-center gap-3">
          <input
            aria-label="视频时长滑杆"
            aria-valuemax={effectiveCapabilities.maxDurationSeconds}
            aria-valuemin={effectiveCapabilities.minDurationSeconds}
            aria-valuenow={value.durationSeconds}
            className="video-duration-range h-3 min-w-0 flex-1 cursor-pointer accent-sky-300"
            max={effectiveCapabilities.maxDurationSeconds}
            min={effectiveCapabilities.minDurationSeconds}
            onChange={(event) => {
              const durationSeconds = Number(event.currentTarget.value);
              applyDurationChange(durationSeconds, true);
            }}
            step={effectiveCapabilities.durationStepSeconds}
            style={{ "--duration-progress": `${durationProgress}%` } as CSSProperties}
            type="range"
            value={value.durationSeconds}
          />
          <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-white/15 bg-black/20 px-2">
            <input
              aria-label="视频时长输入"
              className="w-9 bg-transparent text-center text-sm font-semibold outline-none"
              inputMode="decimal"
              max={effectiveCapabilities.maxDurationSeconds}
              min={effectiveCapabilities.minDurationSeconds}
              onBlur={commitDuration}
              onChange={(event) => setDurationInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              step={effectiveCapabilities.durationStepSeconds}
              type="number"
              value={durationInput}
            />
            <span className="text-xs text-white/55">秒</span>
          </div>
        </div>
        {durationCorrectionMessage ? (
          <p aria-live="polite" className="mt-2 text-xs text-white/70" role="status">{durationCorrectionMessage}</p>
        ) : null}
      </ParameterSection>

      <ParameterSection label="生成音频">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <VideoSegmentedControl
              ariaLabel="生成音频"
              onChange={(audioSetting) => applyChange({ ...value, generateAudio: audioSetting === "on" })}
              options={[
                { disabled: audioUnsupported, disabledReason: UNSUPPORTED_AUDIO, label: "开启", value: "on" },
                { disabled: audioUnsupported, disabledReason: UNSUPPORTED_AUDIO, label: "关闭", value: "off" },
              ]}
              value={value.generateAudio ? "on" : "off"}
            />
          </div>
          {audioUnsupported ? (
            <div className="relative shrink-0">
              <button
                aria-describedby="video-audio-support-help"
                aria-expanded={audioHelpOpen}
                aria-label="音频支持说明"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-sm text-white/75 hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onBlur={() => setAudioHelpOpen(false)}
                onClick={() => setAudioHelpOpen(true)}
                onFocus={() => setAudioHelpOpen(true)}
                onMouseEnter={() => setAudioHelpOpen(true)}
                onMouseLeave={() => setAudioHelpOpen(false)}
                type="button"
              >
                ?
              </button>
              {audioHelpOpen ? (
                <span className="absolute right-0 top-[calc(100%+6px)] z-10 w-44 rounded-lg border border-white/15 bg-[#16161a] px-3 py-2 text-xs leading-5 text-white shadow-lg" id="video-audio-support-help" role="tooltip">
                  {"当前模型不支持生成音频"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </ParameterSection>

      <ParameterSection label="生成数量">
        <VideoSegmentedControl
          ariaLabel="生成数量"
          onChange={(count) => applyChange({ ...value, count })}
          options={countOptions}
          value={value.count}
        />
      </ParameterSection>
    </div>
  );
}

function ParameterSection({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-white/80">{label}</h3>
      {children}
    </section>
  );
}
