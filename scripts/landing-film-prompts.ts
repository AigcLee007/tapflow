export const LANDING_FILM_ROUTE_KEY = "video.pixelhub.gemini-omni-flash";
export const LANDING_FILM_PREFIX = "brand-media/tapflow/landing-film-v1";

export type LandingViewport = "desktop" | "mobile";
export type LandingFilmBrief = { chapter: string; variant: string; desktopPrompt: string; mobilePrompt: string };
export type LandingFilmJob = LandingFilmBrief & { aspectRatio: "16:9" | "9:16"; durationSeconds: 8; resolution: "1080P"; viewport: LandingViewport };

const guard = "No text, no logo, no watermark, no subtitles, no interface, no branding, no UI, no people, no faces, no vehicles, no animals, no flicker, no flash cuts, no glitch, no code, no neon circuitry, no robots.";
const camera = "Single continuous cinematic shot, restrained film grain, physically credible materials, slow stable dolly movement, premium editorial lighting.";
const prompt = (scene: string, desktopZone: string, mobileZone: string) => ({
  desktopPrompt: `${camera} ${scene} ${desktopZone} ${guard}`,
  mobilePrompt: `${camera} ${scene} Recompose vertically with the focal transformation in the lower half and a clean, dark, low-detail upper third for brand copy. ${mobileZone} ${guard}`,
});

export const LANDING_FILM_BRIEFS: readonly LandingFilmBrief[] = [
  { chapter: "imagination", variant: "variant-a", ...prompt("Blue-hour black stone museum city rises from a mirror plain; two colossal silver ribbons detach and lock into an infinity gateway at center-right.", "Keep the left forty percent dark, clean and low-detail for copy.", "Keep architecture sparse around the upper copy zone.") },
  { chapter: "imagination", variant: "variant-b", ...prompt("A monolithic white paper city slowly unfolds from a charcoal void, revealing a warm inner horizon through precise architectural seams.", "Keep the left third nearly black with quiet negative space.", "Keep the upper third a quiet charcoal field.") },
  { chapter: "imagination", variant: "variant-c", ...prompt("A vast obsidian archive of floating rectangular rooms rearranges into one impossible illuminated corridor over still water.", "Reserve a clean dark left-side field; brightest depth sits center-right.", "Reserve clean dark space above the corridor.") },
  { chapter: "rewrite", variant: "variant-a", ...prompt("A long brutalist wall of matte graphite panels glides apart, exposing an amber interior landscape that continuously redraws itself.", "The left forty percent remains shadowed and untextured.", "The upper third stays dark and uncluttered.") },
  { chapter: "rewrite", variant: "variant-b", ...prompt("Thousands of thin brushed-metal pages hover in a silent hall, slowly turning to assemble a luminous curved passage.", "Leave the left third clear for white copy, with action on the right.", "Keep movement concentrated below the upper copy field.") },
  { chapter: "rewrite", variant: "variant-c", ...prompt("A precise concrete staircase loops upward through fogless black space, each landing gently changing into a different impossible material.", "Maintain a dark left safe zone with no objects crossing it.", "Maintain a dark top safe zone.") },
  { chapter: "form", variant: "variant-a", ...prompt("A reflective black cube on a vast salt flat slowly opens into nested glass volumes, catching a single soft sunrise line.", "Place the cube center-right and leave the left forty percent low-detail.", "Keep the cube in the lower half with open dark sky above.") },
  { chapter: "form", variant: "variant-b", ...prompt("A sculptural marble tunnel bends through a silent indigo void; its inner rings rotate slowly and reveal liquid gold reflections.", "Keep the left third empty, dark and calm.", "Keep the upper third empty and dark.") },
  { chapter: "form", variant: "variant-c", ...prompt("A field of translucent architectural blocks rises from shallow water and softly aligns into a giant circular aperture.", "The brightest aperture remains center-right; leave left-side copy space.", "Place the aperture low with an uncluttered upper field.") },
  { chapter: "resolution", variant: "variant-a", ...prompt("A dark ocean of polished glass fragments drifts into one seamless mirror plane that opens toward a distant dawn.", "Keep left forty percent darker and free of fragments.", "Keep the upper third free of fragments.") },
  { chapter: "resolution", variant: "variant-b", ...prompt("A monumental silver ring descends through quiet cloudless midnight and settles above a minimal black plaza, making ripples of light.", "Hold the left-side negative space in deep controlled black.", "Hold the upper copy zone in deep controlled black.") },
  { chapter: "resolution", variant: "variant-c", ...prompt("A long gallery of polished stone arches slowly resolves from abstract shadow into a calm sunlit exit, without a cut.", "The left third remains a calm dark wall for copy.", "The upper third remains an uncluttered dark vault.") },
];

export function makeLandingFilmJobs(): LandingFilmJob[] {
  return LANDING_FILM_BRIEFS.flatMap((brief) => ([
    { ...brief, aspectRatio: "16:9" as const, durationSeconds: 8 as const, resolution: "1080P" as const, viewport: "desktop" as const },
    { ...brief, aspectRatio: "9:16" as const, durationSeconds: 8 as const, resolution: "1080P" as const, viewport: "mobile" as const },
  ]));
}
