import { Check, Palette } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { VIDEO_UI_COPY } from "./videoUiCopy";
import {
  VIDEO_CONTEXT_COLOR_PRESETS,
  VIDEO_CONTEXT_PALETTE_GROUPS,
  VIDEO_VISUAL_TONE_PRESETS,
} from "./videoPalettePresets";
import type {
  VideoContextPaletteRef,
  VideoGenerationParamsV1,
  VideoReferenceRoleAssignment,
} from "./videoTypes";

type VideoPalettePopoverProps = {
  onChange: (value: VideoGenerationParamsV1) => void;
  value: VideoGenerationParamsV1;
};

export function VideoPalettePopover({ onChange, value }: VideoPalettePopoverProps) {
  const layer = useDismissibleLayer("video-palette-popover");
  const assignments = Object.values(value.referenceRolesByKey).filter(isRoleAssignment);
  const emptyReferenceRolesCopy = VIDEO_UI_COPY.noReferenceRolesForContextPalette.replace(/[。.]$/, "");

  const updateContextPalette = (assignment: VideoReferenceRoleAssignment, colorToken: string) => {
    const contextPaletteRefs: VideoContextPaletteRef[] = [
      ...value.contextPaletteRefs.filter((entry) => !sameSourceAndRole(entry, assignment)),
      { role: assignment.role, source: assignment.source, colorToken },
    ];
    onChange({ ...value, contextPaletteRefs });
  };

  return (
    <div className="relative">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="dialog"
        aria-label={VIDEO_UI_COPY.palette}
        className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/10 bg-[#17171b] text-white/75 transition hover:bg-white/[0.08] focus:border-sky-300/50 focus:outline-none"
        onClick={layer.toggle}
        title={VIDEO_UI_COPY.palette}
        type="button"
      >
        <Palette aria-hidden="true" size={16} />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          aria-label={VIDEO_UI_COPY.palette}
          className="absolute bottom-[calc(100%+12px)] right-0 z-[1200] w-[360px] p-3"
          role="dialog"
        >
          <section>
            <h3 className="mb-2 text-[12px] font-bold leading-none text-white/80">{VIDEO_UI_COPY.contextPalette}</h3>
            {assignments.length === 0 ? (
              <p className="py-3 text-[12px] font-medium leading-tight text-white/40">
                {emptyReferenceRolesCopy}
              </p>
            ) : (
              <div className="space-y-3">
                {VIDEO_CONTEXT_PALETTE_GROUPS.map((group) => {
                  const assignment = assignments.find((candidate) => group.roles.includes(candidate.role));
                  if (!assignment) return null;
                  const groupLabel = group.title;
                  return (
                    <div key={groupLabel}>
                      <h4 className="mb-1.5 text-[11px] font-bold leading-none text-white/65">{groupLabel}</h4>
                      <div className="grid grid-cols-6 gap-1.5">
                        {VIDEO_CONTEXT_COLOR_PRESETS.map((color) => {
                          const selected = value.contextPaletteRefs.some((entry) => sameSourceAndRole(entry, assignment)
                            && entry.colorToken === color.token);
                          return (
                            <button
                              key={color.token}
                              aria-label={`${groupLabel}：${color.token}`}
                              aria-pressed={selected}
                              className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition focus:outline-none ${selected
                                ? "border-white ring-2 ring-sky-300/80 ring-offset-2 ring-offset-[#1c1c20]"
                                : "border-white/25 hover:border-white/70"}`}
                              onClick={() => updateContextPalette(assignment, color.token)}
                              style={{ backgroundColor: color.hex }}
                              type="button"
                            >
                              {selected ? <Check aria-label={VIDEO_UI_COPY.selected} size={14} strokeWidth={3} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-3 border-t border-white/10 pt-3">
            <h3 className="mb-2 text-[12px] font-bold leading-none text-white/80">{VIDEO_UI_COPY.visualTone}</h3>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={VIDEO_UI_COPY.visualTone}>
              {VIDEO_VISUAL_TONE_PRESETS.map((tone) => {
                const selected = value.visualTone === tone.value;
                return (
                  <button
                    key={tone.value}
                    aria-checked={selected}
                    aria-label={tone.label}
                    className={`relative min-h-[58px] rounded-[8px] border p-1.5 text-left transition focus:outline-none ${selected
                      ? "border-sky-300 bg-sky-300/10"
                      : "border-white/15 bg-white/[0.025] hover:border-white/40 hover:bg-white/[0.06]"}`}
                    data-tone={tone.value}
                    onClick={() => onChange({ ...value, visualTone: tone.value })}
                    role="radio"
                    type="button"
                  >
                    <span className="mb-1 flex h-4 overflow-hidden rounded-[3px] border border-white/10">
                      {tone.strips.map((color) => (
                        <span key={color} className="flex-1" data-testid="色调色带" style={{ backgroundColor: color }} aria-hidden="true" />
                      ))}
                    </span>
                    <span className="block text-[11px] font-bold leading-none text-white/85">{tone.label}</span>
                    {selected ? (
                      <span className="absolute right-1.5 top-5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-300 text-[#111820]" aria-label={VIDEO_UI_COPY.selected}>
                        <Check aria-hidden="true" size={11} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </MenuSurface>
      ) : null}
    </div>
  );
}

function isRoleAssignment(value: VideoReferenceRoleAssignment | null): value is VideoReferenceRoleAssignment {
  return value !== null;
}

function sameSourceAndRole(entry: VideoContextPaletteRef, assignment: VideoReferenceRoleAssignment) {
  return entry.role === assignment.role
    && entry.source.kind === assignment.source.kind
    && entry.source.id === assignment.source.id;
}
