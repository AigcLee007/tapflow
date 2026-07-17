import { Palette } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from "../../components/menu/menuStyles";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { VIDEO_UI_COPY, VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";
import type {
  VideoContextPaletteRef,
  VideoGenerationParamsV1,
  VideoReferenceRoleAssignment,
} from "./videoTypes";

type VideoPalettePopoverProps = {
  onChange: (value: VideoGenerationParamsV1) => void;
  value: VideoGenerationParamsV1;
};

const CONTEXT_COLORS = [
  { token: "amber", label: VIDEO_UI_COPY.amber, className: "bg-amber-300" },
  { token: "cyan", label: VIDEO_UI_COPY.cyan, className: "bg-cyan-300" },
  { token: "rose", label: VIDEO_UI_COPY.rose, className: "bg-rose-300" },
  { token: "violet", label: VIDEO_UI_COPY.violet, className: "bg-violet-300" },
] as const;

const VISUAL_TONES = [
  { value: "neutral", label: VIDEO_UI_COPY.naturalTone, className: "bg-zinc-200" },
  { value: "cinematic_teal", label: VIDEO_UI_COPY.cinematicTealTone, className: "bg-teal-300" },
  { value: "warm_sunset", label: VIDEO_UI_COPY.warmSunsetTone, className: "bg-orange-300" },
  { value: "cool_moonlight", label: VIDEO_UI_COPY.coolMoonlightTone, className: "bg-sky-300" },
  { value: "monochrome", label: VIDEO_UI_COPY.monochromeTone, className: "bg-zinc-500" },
] as const;

export function VideoPalettePopover({ onChange, value }: VideoPalettePopoverProps) {
  const layer = useDismissibleLayer("video-palette-popover");
  const assignments = Object.values(value.referenceRolesByKey).filter(isRoleAssignment);

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
          className="absolute bottom-[calc(100%+12px)] right-0 z-[1200] w-[300px] p-2"
          role="dialog"
        >
          <section className="px-1.5 pb-2">
            <h3 className="pb-1 text-[10px] font-bold leading-none text-white/40">{VIDEO_UI_COPY.contextPalette}</h3>
            {assignments.length === 0 ? (
              <p className="px-1.5 py-2 text-[10px] font-medium leading-tight text-white/35">
                {VIDEO_UI_COPY.noReferenceRolesForContextPalette}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {assignments.map((assignment) => (
                  <div key={`${assignment.role}:${assignment.source.kind}:${assignment.source.id}`} className="flex h-[38px] items-center gap-[7px] px-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold leading-[1.1] text-white/85">
                      {getRoleColorLabel(assignment.role)}
                    </span>
                    {CONTEXT_COLORS.map((color) => (
                      <button
                        key={color.token}
                        aria-label={`${getRoleColorLabel(assignment.role)}：${color.label}`}
                        className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-white/10 transition hover:border-white/40 focus:border-sky-300 focus:outline-none"
                        onClick={() => updateContextPalette(assignment, color.token)}
                        type="button"
                      >
                        <span className={`h-4 w-4 rounded-full ${color.className}`} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="border-t border-white/10 px-1.5 pt-2">
            <h3 className="pb-1 text-[10px] font-bold leading-none text-white/40">{VIDEO_UI_COPY.visualTone}</h3>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label={VIDEO_UI_COPY.visualTone}>
              {VISUAL_TONES.map((tone) => {
                const selected = value.visualTone === tone.value;
                return (
                  <button
                    key={tone.value}
                    aria-checked={selected}
                    aria-label={tone.label}
                    className={`${MENU_ITEM_CLASS} h-[38px] ${selected ? "bg-white/[0.088]" : ""}`.trim()}
                    data-tone={tone.value}
                    onClick={() => onChange({ ...value, visualTone: tone.value })}
                    role="radio"
                    type="button"
                  >
                    <span className={`h-[30px] w-[30px] shrink-0 rounded-[9px] border border-white/10 ${tone.className}`} />
                    <span className="min-w-0">
                      <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{tone.label}</span>
                      <span className={`${MENU_ITEM_SECONDARY_CLASS} block`}>{selected ? VIDEO_UI_COPY.selected : VIDEO_UI_COPY.applyVisualTone}</span>
                    </span>
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

function getRoleColorLabel(role: keyof typeof VIDEO_UI_REFERENCE_ROLE_COPY) {
  return `${VIDEO_UI_REFERENCE_ROLE_COPY[role]}颜色`;
}
