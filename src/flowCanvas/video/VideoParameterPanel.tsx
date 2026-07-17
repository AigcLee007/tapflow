import { useEffect, useState } from "react";

import {
  correctVideoGenerationParams,
  createSafeDefaultVideoCapabilities,
} from "./videoGenerationCapabilities";
import { VideoAspectRatioGrid } from "./VideoAspectRatioGrid";
import { VideoSegmentedControl } from "./VideoSegmentedControl";
import { VIDEO_UI_COPY } from "./videoUiCopy";
import { VIDEO_VISUAL_TOKENS } from "./videoVisualTokens";
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

  useEffect(() => {
    setDurationInput(String(value.durationSeconds));
  }, [value.durationSeconds]);

  const applyChange = (next: VideoGenerationParamsV1) => {
    onChange(correctVideoGenerationParams(next, effectiveCapabilities).params);
  };

  const commitDuration = () => {
    const parsed = Number(durationInput);
    const nextDuration = Number.isFinite(parsed) ? parsed : value.durationSeconds;
    const corrected = correctVideoGenerationParams(
      { ...value, durationSeconds: nextDuration },
      effectiveCapabilities,
    ).params;
    setDurationInput(String(corrected.durationSeconds));
    onChange(corrected);
  };

  const resolutionOptions = RESOLUTIONS.map((resolution) => ({
    disabled: routeCapabilitiesConfirmed && !effectiveCapabilities.resolutions.includes(resolution),
    disabledReason: UNSUPPORTED_BY_MODEL,
    label: resolution,
    value: resolution,
  }));
  const audioUnsupported = routeCapabilitiesConfirmed && !effectiveCapabilities.supportsAudio;
  const countOptions = COUNTS.map((count) => ({
    disabled: routeCapabilitiesConfirmed && count > effectiveCapabilities.maxCount,
    disabledReason: UNSUPPORTED_BY_MODEL,
    label: `${count} 个`,
    value: count,
  }));

  return (
    <div className={`w-full max-w-[500px] space-y-5 ${VIDEO_VISUAL_TOKENS.panelSurface} ${VIDEO_VISUAL_TOKENS.panelRadius} p-4 text-white`}>
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
        <div className="flex items-center gap-3">
          <input
            aria-label="视频时长滑杆"
            className="h-1 w-full cursor-pointer accent-white"
            max={effectiveCapabilities.maxDurationSeconds}
            min={effectiveCapabilities.minDurationSeconds}
            onChange={(event) => {
              const durationSeconds = Number(event.currentTarget.value);
              setDurationInput(String(durationSeconds));
              applyChange({ ...value, durationSeconds });
            }}
            step={effectiveCapabilities.durationStepSeconds}
            type="range"
            value={value.durationSeconds}
          />
          <div className={`flex h-10 shrink-0 items-center gap-2 px-2 ${VIDEO_VISUAL_TOKENS.panelRadius} border border-white/20 bg-black/15`}>
            <input
              aria-label="视频时长输入"
              className="w-10 bg-transparent text-center text-sm font-medium outline-none"
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
            <span className="text-sm text-white/55">秒</span>
          </div>
        </div>
      </ParameterSection>

      <ParameterSection label="生成音频">
        <VideoSegmentedControl
          ariaLabel="生成音频"
          onChange={(audioSetting) => applyChange({ ...value, generateAudio: audioSetting === "on" })}
          options={[
            { disabled: audioUnsupported, disabledReason: UNSUPPORTED_AUDIO, label: "开启", value: "on" },
            { label: "关闭", value: "off" },
          ]}
          value={value.generateAudio ? "on" : "off"}
        />
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
