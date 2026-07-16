import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

import { MenuSelect } from "../../components/menu/MenuSelect";
import {
  correctVideoGenerationParams,
  createSafeDefaultVideoCapabilities,
} from "./videoGenerationCapabilities";
import type {
  VideoAspectRatio,
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

const ASPECT_RATIO_OPTIONS: Array<{ label: string; value: VideoAspectRatio }> = [
  { value: "auto", label: "自动" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "9:16", label: "9:16" },
  { value: "21:9", label: "21:9" },
];

const RESOLUTION_OPTIONS: Array<{ label: string; value: VideoResolution }> = [
  { value: "480P", label: "480P" },
  { value: "720P", label: "720P" },
  { value: "1080P", label: "1080P" },
  { value: "4K", label: "4K" },
];

const COUNT_OPTIONS: Array<{ label: string; value: VideoCount }> = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
];

export function VideoParameterPanel({ capabilities, onChange, value }: VideoParameterPanelProps) {
  const effectiveCapabilities = capabilities ?? createSafeDefaultVideoCapabilities();
  const [durationInput, setDurationInput] = useState(String(value.durationSeconds));
  const [audioTooltipOpen, setAudioTooltipOpen] = useState(false);

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

  const ratioOptions = ASPECT_RATIO_OPTIONS.filter((option) => effectiveCapabilities.aspectRatios.includes(option.value));
  const resolutionOptions = RESOLUTION_OPTIONS.filter((option) => effectiveCapabilities.resolutions.includes(option.value));
  const countOptions = COUNT_OPTIONS.filter((option) => option.value <= effectiveCapabilities.maxCount);

  return (
    <div className="grid gap-3 text-white">
      <div className="grid grid-cols-3 gap-2">
        <ParameterField label="画面比例">
          <MenuSelect
            fullWidth
            label="画面比例"
            onChange={(aspectRatio) => applyChange({ ...value, aspectRatio: aspectRatio as VideoAspectRatio })}
            options={ratioOptions}
            value={value.aspectRatio}
          />
        </ParameterField>
        <ParameterField label="清晰度">
          <MenuSelect
            fullWidth
            label="清晰度"
            onChange={(resolution) => applyChange({ ...value, resolution: resolution as VideoResolution })}
            options={resolutionOptions}
            value={value.resolution}
          />
        </ParameterField>
        <ParameterField label="生成数量">
          <MenuSelect
            fullWidth
            label="生成数量"
            onChange={(count) => applyChange({ ...value, count: Number(count) as VideoCount })}
            options={countOptions.map((option) => ({ ...option, value: String(option.value) }))}
            value={String(value.count)}
          />
        </ParameterField>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <ParameterField label="时长">
          <div className="flex h-[38px] items-center gap-2 rounded-[10px] border border-white/10 bg-[#17171b] px-2">
            <input
              aria-label="时长滑杆"
              className="h-1 w-full cursor-pointer accent-sky-300"
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
            <input
              aria-label="时长输入"
              className="h-7 w-11 rounded-[7px] border border-white/10 bg-black/20 px-1 text-center text-xs font-bold outline-none focus:border-sky-300/50"
              inputMode="decimal"
              max={effectiveCapabilities.maxDurationSeconds}
              min={effectiveCapabilities.minDurationSeconds}
              onBlur={commitDuration}
              onChange={(event) => setDurationInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitDuration();
                  event.currentTarget.blur();
                }
              }}
              step={effectiveCapabilities.durationStepSeconds}
              type="number"
              value={durationInput}
            />
            <span className="text-[9px] font-medium text-white/40">秒</span>
          </div>
        </ParameterField>

        <div className="relative flex h-[38px] items-center">
          <button
            aria-checked={value.generateAudio}
            aria-label="生成音频"
            className={`group inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border px-2 text-xs font-bold transition ${value.generateAudio ? "border-sky-300/50 bg-sky-300/15 text-sky-100" : "border-white/10 bg-[#17171b] text-white/75"}`}
            onBlur={() => setAudioTooltipOpen(false)}
            onClick={() => applyChange({ ...value, generateAudio: !value.generateAudio })}
            onFocus={() => setAudioTooltipOpen(true)}
            onMouseEnter={() => setAudioTooltipOpen(true)}
            onMouseLeave={() => setAudioTooltipOpen(false)}
            role="switch"
            type="button"
          >
            <Volume2 aria-hidden="true" size={16} />
            <span>音频</span>
          </button>
          {audioTooltipOpen ? (
            <span
              className="absolute bottom-[calc(100%+8px)] right-0 z-10 whitespace-nowrap rounded-[7px] border border-white/10 bg-[#1c1c20] px-2 py-1 text-[9px] font-medium text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
              role="tooltip"
            >
              生成音频
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ParameterField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid min-w-0 gap-1 text-[9px] font-medium leading-[1.25] text-white/40">
      <span>{label}</span>
      {children}
    </div>
  );
}
