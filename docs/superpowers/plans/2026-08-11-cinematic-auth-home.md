# Cinematic Auth Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current anonymous auth shell with a four-chapter, surreal-cinematic video homepage that opens the existing v2 authentication flows in an accessible responsive dialog.

**Architecture:** Keep media production separate from runtime delivery. A guarded offline script reuses the existing PixelleLabs H3video adapter to create reviewed film masters, transcodes and uploads approved outputs, while the React client reads a versioned URL manifest and plays only the active chapter. Existing login, registration, verification, password-reset, tenant, and `returnTo` logic is refactored into focused panels rendered by one shared auth experience.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library, Lucide React, existing `@aigc-flow/ai-gateway-core`, existing `@aigc-flow/storage`, ffmpeg, S3-compatible object storage, Browser/Playwright smoke QA.

**Design reference:** `docs/superpowers/specs/2026-08-11-cinematic-auth-home-design.md`

---

## File Map

Create these focused units:

- `scripts/landing-film-prompts.ts`: the 12 reviewed generation briefs and deterministic output names.
- `scripts/landing-film-pipeline.ts`: provider polling, download, ffmpeg encoding, poster extraction, and S3 upload helpers.
- `scripts/generate-landing-films.ts`: guarded CLI entry for dry-run, generation, encode, and publish phases.
- `scripts/landing-film-pipeline.test.ts`: prompt and pipeline contract tests with mocked provider/storage/process boundaries.
- `src/auth/landing/landingFilmManifest.ts`: runtime film types, four chapter copy blocks, three variant sets, and media URL construction.
- `src/auth/landing/landingFilmManifest.test.ts`: manifest completeness and stable-path tests.
- `src/auth/landing/filmPlaybackPolicy.ts`: pure loading, reduced-motion, low-end, and adjacent-preload decisions.
- `src/auth/landing/filmPlaybackPolicy.test.ts`: playback-policy unit tests.
- `src/auth/landing/useFilmStage.ts`: active chapter observation, stable per-mount variant selection, and media playback coordination.
- `src/auth/landing/FilmStage.tsx`: full-viewport chapters, media elements, fixed brand navigation, chapter rail, and playback control.
- `src/auth/landing/FilmStage.test.tsx`: film visibility, preload, error fallback, reduced-motion, and control tests.
- `src/auth/landing/cinematicAuthHome.css`: chapter layout, overlays, scroll snapping, transitions, safe areas, and reduced-motion styles.
- `src/auth/AuthDialog.tsx`: portal, focus trap, focus restoration, body scroll lock, pending-submit dismissal guard, and responsive shell.
- `src/auth/AuthDialog.test.tsx`: dialog accessibility and dismissal tests.
- `src/auth/AuthFormControls.tsx`: shared field, error, primary, and secondary controls formerly owned by `LoginPage.tsx`.
- `src/auth/AuthExperiencePage.tsx`: film stage plus route-aware auth dialog orchestration.
- `src/auth/authNavigation.ts`: safe `returnTo` parsing and auth-mode route construction.
- `src/auth/authNavigation.test.ts`: open/close and `returnTo` route contracts.
- `scripts/smoke-cinematic-auth-home.ts`: real-browser desktop/mobile playback and overlap smoke.
- `scripts/smoke-cinematic-auth-home.test.ts`: smoke contract test.

Modify these existing files:

- `src/auth/LoginPage.tsx`: remove `AuthShell`/preview ownership and export an embeddable login panel.
- `src/auth/RegisterPage.tsx`: export an embeddable registration/verification panel.
- `src/auth/ForgotPasswordPage.tsx`: export an embeddable recovery panel with explicit resend/error state.
- `src/auth/EmailVerificationStep.tsx`: align controls with shared neutral auth styling.
- `src/auth/AuthPages.test.tsx`: preserve v2 auth behavior and add route-aware dialog integration coverage.
- `src/app/AppRouter.tsx`: route all three public auth paths through `AuthExperiencePage`.
- `src/app/routes.test.ts`: add public auth route-family assertions.
- `src/utils/performance.ts`: expose an explicit media-motion policy input without changing existing low-end behavior.
- `src/index.css`: import the cinematic auth stylesheet only if CSS module import placement requires it.
- `package.json`: add film dry-run/generation/publish and auth-home smoke commands.
- `Dockerfile`: pass `VITE_LANDING_MEDIA_BASE_URL` into the frontend build.
- `docker-compose.staging.yml`: provide the frontend build argument from the server environment.
- `docs/STAGING_ENV_TEMPLATE.md`: document the public CDN base URL; do not document a real credential.
- `PROJECT_RECORD.md`: record implementation and validation results.

## Task 1: Lock the Film Briefs and Output Contract

**Files:**
- Create: `scripts/landing-film-prompts.ts`
- Create: `scripts/landing-film-pipeline.test.ts`

- [ ] **Step 1: Write the failing prompt-catalog test**

Add a test that requires four chapter IDs, three variants per chapter, two orientations per brief, no baked-in text request, and deterministic object keys:

```ts
import { describe, expect, test } from "vitest";
import { buildLandingFilmObjectKey, LANDING_FILM_BRIEFS } from "./landing-film-prompts.js";

describe("landing film briefs", () => {
  test("defines twelve complete surreal-cinematic briefs", () => {
    expect(LANDING_FILM_BRIEFS).toHaveLength(12);
    expect(new Set(LANDING_FILM_BRIEFS.map((brief) => brief.chapterId))).toEqual(
      new Set(["imagination", "rewrite", "form", "resolution"]),
    );
    for (const brief of LANDING_FILM_BRIEFS) {
      expect(brief.desktopPrompt).toContain("no text, no watermark");
      expect(brief.mobilePrompt).toContain("vertical 9:16 composition");
      expect(brief.negativePrompt).toContain("glitch");
    }
    expect(buildLandingFilmObjectKey("v1", LANDING_FILM_BRIEFS[0]!, "desktop", "mp4"))
      .toBe("brand-media/tapflow/landing-film-v1/imagination/variant-a/desktop.mp4");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest --run scripts/landing-film-pipeline.test.ts`

Expected: FAIL because `landing-film-prompts.ts` does not exist.

- [ ] **Step 3: Implement the complete brief catalog**

Define this public contract and fill all 12 entries with the four approved visual directions, three controlled variants each, and explicit horizontal/vertical safe zones:

```ts
export type LandingFilmChapterId = "imagination" | "rewrite" | "form" | "resolution";
export type LandingFilmVariantId = "variant-a" | "variant-b" | "variant-c";
export type LandingFilmOrientation = "desktop" | "mobile";

export type LandingFilmBrief = {
  chapterId: LandingFilmChapterId;
  desktopPrompt: string;
  mobilePrompt: string;
  negativePrompt: string;
  variantId: LandingFilmVariantId;
};

const sharedDirection = "photoreal cinematic surrealism, continuous confident camera movement, physically accurate light and materials, restrained film grain, controlled black levels, no text, no watermark";
const sharedNegative = "glitch, code rain, neon circuitry, robots, galaxies, particles, flashing cuts, subtitles, logos, watermark";

export const LANDING_FILM_BRIEFS: readonly LandingFilmBrief[] = [
  {
    chapterId: "imagination",
    variantId: "variant-a",
    desktopPrompt: `${sharedDirection}. A real city at dawn folds like paper while streets rise into suspended paths, centered subject with a clean left and lower safe zone for white brand copy, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A real city at dawn folds like paper while streets rise into suspended paths, centered subject with a clean upper and lower safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "imagination",
    variantId: "variant-b",
    desktopPrompt: `${sharedDirection}. A rain-wet modern plaza bends upward into a graceful impossible arc as pedestrians continue naturally, the camera glides through the architecture, clean center-left copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A rain-wet modern plaza bends upward into a graceful impossible arc as pedestrians continue naturally, the camera rises through the architecture, clean upper copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "imagination",
    variantId: "variant-c",
    desktopPrompt: `${sharedDirection}. A quiet coastal metropolis separates into floating architectural layers above the sea and reconnects into one horizon, slow forward camera, dark lower copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A quiet coastal metropolis separates into floating architectural layers above the sea and reconnects into one horizon, slow upward camera, dark lower copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "rewrite",
    variantId: "variant-a",
    desktopPrompt: `${sharedDirection}. Inside a real photography studio, one wall liquefies into a calm vertical ocean while furniture becomes weightless and a human subject remains naturally grounded, clean right copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. Inside a tall photography studio, the back wall liquefies into a calm ocean while furniture becomes weightless and a human subject remains naturally grounded, clean upper copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "rewrite",
    variantId: "variant-b",
    desktopPrompt: `${sharedDirection}. A museum gallery floor slowly turns into reflective water and framed landscapes extend physically beyond their canvases, one unbroken lateral camera move, clean left copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A tall museum gallery floor slowly turns into reflective water and framed landscapes extend physically beyond their canvases, one unbroken rising camera move, clean center copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "rewrite",
    variantId: "variant-c",
    desktopPrompt: `${sharedDirection}. A concrete apartment opens into a windswept field without a cut, curtains and grass share one continuous motion, realistic person in foreground, clean lower-left copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A concrete apartment opens vertically into a windswept field without a cut, curtains and grass share one continuous motion, realistic person centered low, clean upper copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "form",
    variantId: "variant-a",
    desktopPrompt: `${sharedDirection}. One sculptural human figure transforms continuously from clear glass to woven textile to liquid metal to living botanical structure, consistent identity and lighting, slow orbit camera, clean left copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. One full-height sculptural human figure transforms continuously from clear glass to woven textile to liquid metal to living botanical structure, consistent identity and lighting, slow orbit camera, clean upper copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "form",
    variantId: "variant-b",
    desktopPrompt: `${sharedDirection}. A single elegant chair changes material from carved ice to folded silk to polished chrome to flowering vines while its silhouette remains stable, precise studio light, clean right copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A single elegant chair changes material from carved ice to folded silk to polished chrome to flowering vines while its silhouette remains stable, precise tall studio light, clean upper copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "form",
    variantId: "variant-c",
    desktopPrompt: `${sharedDirection}. A dancer crosses one continuous room as her clothing and the surrounding walls become porcelain, translucent fabric, liquid silver, and moss without changing her face, clean lower copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A dancer moves upward through one continuous tall room as her clothing and walls become porcelain, translucent fabric, liquid silver, and moss without changing her face, clean top copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "resolution",
    variantId: "variant-a",
    desktopPrompt: `${sharedDirection}. The camera pulls back from a vast impossible landscape of folded city, ocean studio, glass figure, and botanical architecture until the spaces resolve into a subtle infinity-shaped environment, dark central copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. The camera rises away from stacked surreal worlds of folded city, ocean studio, glass figure, and botanical architecture until they resolve into a subtle vertical infinity-shaped environment, dark center copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "resolution",
    variantId: "variant-b",
    desktopPrompt: `${sharedDirection}. Hundreds of realistic architectural fragments drift together in deep black space and lock into one restrained luminous infinity form made from real materials, slow pullback, clean lower copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. Hundreds of realistic architectural fragments drift together in deep black space and lock into one restrained luminous infinity form made from real materials, slow vertical pullback, clean lower copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
  {
    chapterId: "resolution",
    variantId: "variant-c",
    desktopPrompt: `${sharedDirection}. A seamless camera pullback reveals four surreal rooms connected as one continuous infinity-shaped building at night, restrained practical light and deep shadows, clean center copy safe zone, horizontal 16:9 composition.`,
    mobilePrompt: `${sharedDirection}. A seamless upward camera pullback reveals four surreal rooms connected as one continuous vertical infinity-shaped building at night, restrained practical light and deep shadows, clean center copy safe zone, vertical 9:16 composition.`,
    negativePrompt: sharedNegative,
  },
];

export function buildLandingFilmObjectKey(
  version: string,
  brief: LandingFilmBrief,
  orientation: LandingFilmOrientation,
  extension: "mp4" | "webm" | "webp",
) {
  return `brand-media/tapflow/landing-film-${version}/${brief.chapterId}/${brief.variantId}/${orientation}.${extension}`;
}
```

The implementation must contain all 12 literal entries; do not generate prose by concatenating generic chapter names.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest --run scripts/landing-film-pipeline.test.ts`

Expected: PASS with one prompt-catalog test.

- [ ] **Step 5: Commit the film brief contract**

```bash
git add scripts/landing-film-prompts.ts scripts/landing-film-pipeline.test.ts
git commit -m "feat: define cinematic landing film briefs"
```

## Task 2: Build the Guarded Offline Film Pipeline

**Files:**
- Create: `scripts/landing-film-pipeline.ts`
- Create: `scripts/generate-landing-films.ts`
- Modify: `scripts/landing-film-pipeline.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing pipeline boundary tests**

Extend the test file to cover dry-run secrecy, fixed H3 input, polling, 15-second-master trimming, and upload keys:

```ts
test("builds a silent 2K H3 request without exposing the key", () => {
  const request = buildLandingFilmRequest(LANDING_FILM_BRIEFS[0]!, "desktop");
  expect(request.params).toEqual({
    aspectRatio: "16:9",
    count: 1,
    durationSeconds: 15,
    generateAudio: false,
    mode: "text_to_video",
    resolution: "2K",
  });
  expect(JSON.stringify(request)).not.toContain("LANDING_FILM_API_KEY");
});

test("uses reviewed deterministic encode outputs", () => {
  expect(buildEncodePlan("raw.mp4", "out", 1.5, 10)).toMatchObject({
    mp4Path: expect.stringContaining("desktop.mp4"),
    posterPath: expect.stringContaining("desktop.webp"),
  });
});
```

- [ ] **Step 2: Run the tests and verify the new assertions fail**

Run: `npx vitest --run scripts/landing-film-pipeline.test.ts`

Expected: FAIL because the pipeline helpers are missing.

- [ ] **Step 3: Implement provider, encode, and upload helpers**

Use `PixelleLabsH3VideoAdapter` with `pixelleLabsH3VideoManifest.routes[0].requestConfig`, poll until success/failure/deadline, download the returned MP4, and invoke ffmpeg with explicit arguments:

```ts
export const buildEncodeArgs = (input: string, output: string, startSeconds: number, durationSeconds: number) => [
  "-hide_banner", "-loglevel", "error", "-ss", String(startSeconds), "-i", input,
  "-t", String(durationSeconds), "-an", "-c:v", "libx264", "-preset", "slow",
  "-crf", "22", "-movflags", "+faststart", "-pix_fmt", "yuv420p", output,
];

export const buildPosterArgs = (input: string, output: string) => [
  "-hide_banner", "-loglevel", "error", "-ss", "0.15", "-i", input,
  "-frames:v", "1", "-vf", "scale='min(1600,iw)':-2", output,
];
```

The CLI must require these environment variables only for live phases:

```text
LANDING_FILM_API_KEY
LANDING_MEDIA_PUBLIC_BASE_URL
S3_REGION
S3_BUCKET
S3_ENDPOINT (optional for AWS, required for compatible providers that need it)
S3_ACCESS_KEY_ID (optional when instance credentials are available)
S3_SECRET_ACCESS_KEY (optional when instance credentials are available)
```

Reject live execution unless `--confirm-generation-cost` is present. Never print the API key or Authorization header. Write raw and encoded candidates under `.codex-tmp/landing-films/v1/`, upload only files named in an explicit `approved-films.json`, and never delete or overwrite a different version prefix.

- [ ] **Step 4: Add guarded package commands**

```json
{
  "scripts": {
    "landing-films:dry-run": "tsx scripts/generate-landing-films.ts --dry-run",
    "landing-films:generate": "tsx scripts/generate-landing-films.ts --generate --confirm-generation-cost",
    "landing-films:publish": "tsx scripts/generate-landing-films.ts --publish"
  }
}
```

- [ ] **Step 5: Verify dry-run and tests**

Run: `npm run landing-films:dry-run`

Expected: prints 24 planned provider jobs, deterministic output paths, and zero secrets; performs no network request.

Run: `npx vitest --run scripts/landing-film-pipeline.test.ts`

Expected: PASS for prompt, request, polling, encode, approval, and upload-key contracts.

- [ ] **Step 6: Commit the offline pipeline**

```bash
git add package.json scripts/generate-landing-films.ts scripts/landing-film-pipeline.ts scripts/landing-film-pipeline.test.ts
git commit -m "feat: add guarded landing film pipeline"
```

## Task 3: Add the Runtime Film Manifest and Playback Policy

**Files:**
- Create: `src/auth/landing/landingFilmManifest.ts`
- Create: `src/auth/landing/landingFilmManifest.test.ts`
- Create: `src/auth/landing/filmPlaybackPolicy.ts`
- Create: `src/auth/landing/filmPlaybackPolicy.test.ts`
- Modify: `src/utils/performance.ts`

- [ ] **Step 1: Write failing manifest and policy tests**

```ts
test("builds four complete chapters for every variant", () => {
  for (const variant of ["variant-a", "variant-b", "variant-c"] as const) {
    const chapters = buildLandingFilmChapters(variant, "/media/v1");
    expect(chapters.map((chapter) => chapter.id)).toEqual(["imagination", "rewrite", "form", "resolution"]);
    expect(chapters[0]!.desktop.mp4).toBe("/media/v1/imagination/variant-a/desktop.mp4");
    expect(chapters[0]!.mobile.poster).toBe("/media/v1/imagination/variant-a/mobile.webp");
  }
});

test("falls back to posters for reduced motion, data saver, or low-end devices", () => {
  expect(resolveFilmPlaybackPolicy({ reducedMotion: true, saveData: false, lowEnd: false }).playVideo).toBe(false);
  expect(resolveFilmPlaybackPolicy({ reducedMotion: false, saveData: true, lowEnd: false }).playVideo).toBe(false);
  expect(resolveFilmPlaybackPolicy({ reducedMotion: false, saveData: false, lowEnd: true }).playVideo).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest --run src/auth/landing/landingFilmManifest.test.ts src/auth/landing/filmPlaybackPolicy.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement the manifest and pure policy**

Define `LandingFilmChapter`, `LandingFilmSourceSet`, and `LandingFilmVariantId`. Use `import.meta.env.VITE_LANDING_MEDIA_BASE_URL || "/landing-films/v1"` as the base, normalize one trailing slash, and include the approved Chinese copy exactly. Implement:

```ts
export function resolveFilmPlaybackPolicy(input: {
  lowEnd: boolean;
  reducedMotion: boolean;
  saveData: boolean;
}) {
  const playVideo = !input.lowEnd && !input.reducedMotion && !input.saveData;
  return { playVideo, transition: input.reducedMotion ? "none" : "dissolve" } as const;
}

export function preloadForChapter(index: number, activeIndex: number) {
  if (index === activeIndex) return "auto" as const;
  if (Math.abs(index - activeIndex) === 1) return "metadata" as const;
  return "none" as const;
}
```

Extend `src/utils/performance.ts` with a read-only `getConnectionSaveData()` helper so tests can stub it without changing `isLowEndDevice()` consumers.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest --run src/auth/landing/landingFilmManifest.test.ts src/auth/landing/filmPlaybackPolicy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime media contracts**

```bash
git add src/auth/landing/landingFilmManifest.ts src/auth/landing/landingFilmManifest.test.ts src/auth/landing/filmPlaybackPolicy.ts src/auth/landing/filmPlaybackPolicy.test.ts src/utils/performance.ts
git commit -m "feat: add landing film runtime policy"
```

## Task 4: Build the Full-Screen Film Stage

**Files:**
- Create: `src/auth/landing/useFilmStage.ts`
- Create: `src/auth/landing/FilmStage.tsx`
- Create: `src/auth/landing/FilmStage.test.tsx`
- Create: `src/auth/landing/cinematicAuthHome.css`

- [ ] **Step 1: Write failing stage behavior tests**

The test harness must stub `IntersectionObserver`, `matchMedia`, `HTMLMediaElement.play`, and `pause`, then assert:

```ts
expect(screen.getAllByTestId("film-chapter")).toHaveLength(4);
expect(screen.getByRole("heading", { name: "TapFlow" })).toBeTruthy();
expect(screen.getByText("让想象，成为现场。")).toBeTruthy();
expect(screen.getByRole("button", { name: "开始创作" })).toBeTruthy();
expect(screen.getByRole("button", { name: "暂停背景影片" })).toBeTruthy();

observerCallback([{ isIntersecting: true, intersectionRatio: 0.8, target: chapterTwo } as IntersectionObserverEntry], observer);
expect(videoOne.pause).toHaveBeenCalled();
expect(videoTwo.play).toHaveBeenCalled();
expect(videoThree.getAttribute("preload")).toBe("metadata");
expect(videoFour.getAttribute("preload")).toBe("none");
```

Add separate tests for video `error` keeping the poster, reduced motion rendering no autoplay videos, CTA dispatch, chapter-rail navigation, and dialog-open playback rate `0.35`.

- [ ] **Step 2: Run the stage tests and verify they fail**

Run: `npx vitest --run src/auth/landing/FilmStage.test.tsx`

Expected: FAIL because the stage does not exist.

- [ ] **Step 3: Implement stage coordination**

`useFilmStage` owns `activeIndex`, `pausedByUser`, `failedChapterIds`, and one stable `variantId` selected in a lazy state initializer. Use an observer threshold array containing `0.6`; select the highest visible intersecting chapter. For each media element:

```ts
video.muted = true;
video.loop = true;
video.playsInline = true;
video.playbackRate = dialogOpen ? 0.35 : 1;
if (shouldPlay) void video.play().catch(() => markFailed(chapter.id));
else video.pause();
```

`FilmStage` renders semantic sections, `<picture>` posters, conditional `<video>` sources for 16:9 and 9:16, the existing `BrandMark`, Lucide `Play`, `Pause`, and `LogIn` icons, a four-line chapter rail, and two CTA callbacks: `onOpenAuth` and `onEnterWorkspace`.

- [ ] **Step 4: Implement the visual stylesheet**

Use `.cinematic-auth-home` with `background: #050505`, `scroll-snap-type: y mandatory`, stable `min-height: 100svh`, full-bleed media, locally tuned black overlays, fixed navigation safe areas, `600ms` opacity transitions, 8 px button/dialog radii, and explicit desktop/mobile typography breakpoints. Add `@media (prefers-reduced-motion: reduce)` to remove scroll snapping and transitions. Do not add gradients unrelated to media legibility, decorative cards, negative letter spacing, or viewport-width font scaling.

- [ ] **Step 5: Run tests and production build**

Run: `npx vitest --run src/auth/landing/FilmStage.test.tsx src/auth/landing/landingFilmManifest.test.ts src/auth/landing/filmPlaybackPolicy.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS; existing Browserslist/chunk warnings may remain non-blocking.

- [ ] **Step 6: Commit the film stage**

```bash
git add src/auth/landing/useFilmStage.ts src/auth/landing/FilmStage.tsx src/auth/landing/FilmStage.test.tsx src/auth/landing/cinematicAuthHome.css
git commit -m "feat: build cinematic landing stage"
```

## Task 5: Build the Accessible Authentication Dialog

**Files:**
- Create: `src/auth/AuthDialog.tsx`
- Create: `src/auth/AuthDialog.test.tsx`
- Create: `src/auth/AuthFormControls.tsx`

- [ ] **Step 1: Write failing dialog accessibility tests**

```ts
test("locks scroll, traps focus, blocks pending dismissal, and restores trigger focus", async () => {
  const trigger = screen.getByRole("button", { name: "开始创作" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "登录 TapFlow" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "关闭登录" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
```

Add a second harness with `pending={true}` and assert outside pointerdown and Escape do not close it.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest --run src/auth/AuthDialog.test.tsx`

Expected: FAIL because `AuthDialog` is missing.

- [ ] **Step 3: Implement the dialog and shared controls**

Use `createPortal`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a captured trigger ref, body overflow restoration, first-focus behavior, and the same explicit focusable selector already proven in `VideoCameraLibrary.tsx`. Render a 38/62 desktop grid and a mobile bottom sheet; omit the media still below the desktop breakpoint. The close button uses Lucide `X` with an accessible label and tooltip.

Move `AuthField`, `AuthErrorMessage`, `AuthPrimaryButton`, and `AuthSecondaryButton` into `AuthFormControls.tsx`. Keep label associations, autocomplete values, disabled semantics, and 16 px mobile input text. Replace cyan glow with neutral borders and a white primary action.

- [ ] **Step 4: Run the dialog tests**

Run: `npx vitest --run src/auth/AuthDialog.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the dialog foundation**

```bash
git add src/auth/AuthDialog.tsx src/auth/AuthDialog.test.tsx src/auth/AuthFormControls.tsx
git commit -m "feat: add cinematic auth dialog"
```

## Task 6: Refactor Existing Auth Flows into Dialog Panels

**Files:**
- Create: `src/auth/authNavigation.ts`
- Create: `src/auth/authNavigation.test.ts`
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/RegisterPage.tsx`
- Modify: `src/auth/ForgotPasswordPage.tsx`
- Modify: `src/auth/EmailVerificationStep.tsx`
- Modify: `src/auth/AuthPages.test.tsx`

- [ ] **Step 1: Write failing navigation and auth-panel tests**

Cover safe `returnTo`, mode switching, password-reset success, direct route state, existing login/registration payloads, verification/resend, and no tenant field:

```ts
expect(getSafeReturnTo("?returnTo=%2Fprojects%2Fp1")).toBe("/projects/p1");
expect(getSafeReturnTo("?returnTo=https%3A%2F%2Fevil.test")).toBe("/workspace");
expect(buildAuthModePath("register", "?returnTo=%2Fassets")).toBe("/register?returnTo=%2Fassets");
expect(buildAuthModePath("login", "?passwordReset=success")).toBe("/login?passwordReset=success");
```

Update auth page tests to locate controls inside `role="dialog"` and retain all current assertions for v2 request bodies, challenge tokens, countdown behavior, focus after invalid code, and authenticated navigation.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest --run src/auth/authNavigation.test.ts src/auth/AuthPages.test.tsx`

Expected: FAIL because panel contracts and safe navigation helpers are absent.

- [ ] **Step 3: Implement safe navigation helpers**

Accept only same-origin absolute paths beginning with `/`; reject protocol-relative paths, `/login`, `/register`, and `/forgot-password` loops. Preserve `returnTo` while switching auth modes. Use `pushState` plus one `popstate` dispatch, matching the existing router.

- [ ] **Step 4: Convert pages into embeddable panels**

Export `LoginPanel`, `RegisterPanel`, and `ForgotPasswordPanel` that render their own `<form>` content but no page background. Each accepts:

```ts
type AuthPanelProps = {
  onModeChange: (mode: "login" | "register" | "forgot-password") => void;
  onPendingChange: (pending: boolean) => void;
};
```

Keep the existing v2 client calls exactly. `ForgotPasswordPanel` must move one-line statements into readable blocks, catch resend failures, disable resend while pending, and navigate to `/login?passwordReset=success`. `LoginPanel` displays a polite success status when that query is present. `EmailVerificationStep` adopts shared neutral controls without changing its timer or six-digit validation.

- [ ] **Step 5: Run the complete auth regression file**

Run: `npx vitest --run src/auth/authNavigation.test.ts src/auth/AuthDialog.test.tsx src/auth/AuthPages.test.tsx`

Expected: PASS for all existing and new auth assertions.

- [ ] **Step 6: Commit the panel refactor**

```bash
git add src/auth/authNavigation.ts src/auth/authNavigation.test.ts src/auth/LoginPage.tsx src/auth/RegisterPage.tsx src/auth/ForgotPasswordPage.tsx src/auth/EmailVerificationStep.tsx src/auth/AuthPages.test.tsx
git commit -m "refactor: embed v2 auth flows in dialog panels"
```

## Task 7: Integrate the Film Stage with Public Auth Routes

**Files:**
- Create: `src/auth/AuthExperiencePage.tsx`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/app/routes.test.ts`
- Modify: `src/auth/AuthPages.test.tsx`

- [ ] **Step 1: Write failing route integration tests**

Test these exact states:

```text
/login                       -> film visible, dialog closed
/login?passwordReset=success -> film visible, login dialog open with success status
/register                    -> film visible, register dialog open
/forgot-password             -> film visible, recovery dialog open
anonymous CTA                -> login dialog opens without route change
authenticated CTA            -> navigates to /workspace without dialog
close direct /register       -> navigates to /login and closes dialog
close direct /forgot-password -> navigates to /login and closes dialog
```

- [ ] **Step 2: Run integration tests and verify they fail**

Run: `npx vitest --run src/auth/AuthPages.test.tsx src/app/routes.test.ts`

Expected: FAIL because the router still renders three standalone pages.

- [ ] **Step 3: Implement `AuthExperiencePage`**

Derive the route mode from the pathname. Initialize the dialog open for register, recovery, and password-reset-success; keep plain `/login` closed. Render `FilmStage` behind `AuthDialog`, select the panel by mode, pass pending state to the dismissal guard, and route authenticated CTAs directly to `/workspace`. Keep `AppVersionReminder` on all public auth routes.

- [ ] **Step 4: Collapse router auth branches**

Replace three separate branches with one route-family check that renders:

```tsx
if ([LOGIN_ROUTE, REGISTER_ROUTE, FORGOT_PASSWORD_ROUTE].includes(pathname)) {
  return <><AuthExperiencePage pathname={pathname} /><AppVersionReminder /></>;
}
```

- [ ] **Step 5: Run auth and router tests**

Run: `npx vitest --run src/auth/AuthPages.test.tsx src/auth/AuthDialog.test.tsx src/auth/authNavigation.test.ts src/app/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the production build and commit**

Run: `npm run build`

Expected: PASS with only known non-blocking warnings.

```bash
git add src/auth/AuthExperiencePage.tsx src/app/AppRouter.tsx src/app/routes.test.ts src/auth/AuthPages.test.tsx
git commit -m "feat: route public auth through cinematic home"
```

## Task 8: Generate, Review, Encode, and Publish the Film Assets

**Files:**
- Runtime candidate directory: `.codex-tmp/landing-films/v1/`
- Create after review: `.codex-tmp/landing-films/v1/approved-films.json`
- Modify only if a shot is rejected: `scripts/landing-film-prompts.ts`

- [ ] **Step 1: Confirm provider and storage readiness without exposing values**

Run a small environment-presence check that prints only booleans for `LANDING_FILM_API_KEY`, `LANDING_MEDIA_PUBLIC_BASE_URL`, `S3_REGION`, and `S3_BUCKET`. Then run `npm run landing-films:dry-run`.

Expected: all required presence flags are `true`; dry-run reports 24 planned masters and performs no external request.

- [ ] **Step 2: Generate one horizontal and one vertical candidate for chapter one**

Run the CLI with an explicit include filter for `imagination/variant-a` before starting the remaining jobs:

```bash
npm run landing-films:generate -- --include imagination/variant-a
```

Expected: two completed 2K/15-second masters with provider task IDs recorded in a secret-free local report.

- [ ] **Step 3: Inspect the pilot candidates**

Use `ffprobe` to verify dimensions, duration, codec, and absence of required audio. Render representative first/middle/last frames and visually confirm subject framing, safe text zones, no watermark/text, no flashing, realistic materials, and a usable 8-12 second loop segment. Reject the candidate in the local approval manifest if any condition fails, adjust only the matching literal prompt, and regenerate that candidate.

- [ ] **Step 4: Generate the remaining candidates in bounded batches**

Run one chapter at a time so provider failures and cost remain attributable:

```bash
npm run landing-films:generate -- --include rewrite
npm run landing-films:generate -- --include form
npm run landing-films:generate -- --include resolution
npm run landing-films:generate -- --include imagination/variant-b,imagination/variant-c
```

Expected: 24 reviewed masters total. Do not publish unreviewed outputs.

- [ ] **Step 5: Encode approved loops and posters**

Record `startSeconds` and `durationSeconds` between 8 and 12 for every approved composition in `approved-films.json`, then run the publish command. The pipeline first creates H.264 fast-start MP4, optional WebM, and WebP poster files, validates them with ffprobe, and uploads them under the immutable `landing-film-v1` prefix.

Run: `npm run landing-films:publish`

Expected: 24 MP4s, 24 posters, and any enabled WebM alternatives uploaded; the command prints stable public URLs and verifies each with an HTTP HEAD request. It does not delete any object.

- [ ] **Step 6: Verify public media paths**

Run `npm run landing-films:dry-run -- --verify-public` using the same public base URL.

Expected: all manifest paths return 200, correct content types, and non-zero content lengths.

- [ ] **Step 7: Commit prompt corrections only**

Do not commit generated masters, credentials, local reports, or `approved-films.json`. If prompt corrections were required:

```bash
git add scripts/landing-film-prompts.ts scripts/landing-film-pipeline.test.ts
git commit -m "refine: align cinematic landing film prompts"
```

## Task 9: Wire CDN Configuration and Browser Smoke QA

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Create: `scripts/smoke-cinematic-auth-home.ts`
- Create: `scripts/smoke-cinematic-auth-home.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing deployment and smoke contract tests**

Assert the Docker build argument exists, Compose forwards it, the env template documents it, and the smoke script checks motion rather than only DOM presence:

```ts
expect(dockerfile).toContain("ARG VITE_LANDING_MEDIA_BASE_URL");
expect(compose).toContain("VITE_LANDING_MEDIA_BASE_URL: ${VITE_LANDING_MEDIA_BASE_URL}");
expect(envTemplate).toContain("VITE_LANDING_MEDIA_BASE_URL");
expect(smokeSource).toContain("currentTime");
expect(smokeSource).toContain("document.elementsFromPoint");
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npx vitest --run scripts/smoke-cinematic-auth-home.test.ts`

Expected: FAIL because deployment wiring and smoke script are missing.

- [ ] **Step 3: Wire the frontend build variable**

Add to `Dockerfile` builder stage:

```dockerfile
ARG VITE_LANDING_MEDIA_BASE_URL=/landing-films/v1
ENV VITE_LANDING_MEDIA_BASE_URL=$VITE_LANDING_MEDIA_BASE_URL
```

Add the corresponding `tapflow-frontend.build.args` entry in `docker-compose.staging.yml`. Document a placeholder public CDN origin in `docs/STAGING_ENV_TEMPLATE.md`; do not add keys or secrets because browser media URLs are intentionally public.

- [ ] **Step 4: Implement browser smoke coverage**

Follow existing smoke-script conventions. Start the built frontend on an unused local port with fixture MP4/poster responses, then verify at 1440x900 and 390x844:

```text
first poster is nonblank
active video currentTime increases between samples
only one video is playing
next chapter preload is metadata and distant chapters are none
scroll activates the next chapter
headline, navigation, rail, and CTA do not overlap at sampled points
login dialog opens, traps focus, and closes with Escape
register and forgot-password direct routes open the correct panel
reduced-motion context renders posters without autoplay
```

Save screenshots under `output/playwright/cinematic-auth-home/` and fail if the primary media area has near-uniform blank pixels.

- [ ] **Step 5: Add and run smoke commands**

Add:

```json
{
  "scripts": {
    "smoke:cinematic-auth-home": "tsx scripts/smoke-cinematic-auth-home.ts",
    "test:smoke-cinematic-auth-home": "vitest --run scripts/smoke-cinematic-auth-home.test.ts"
  }
}
```

Run: `npm run test:smoke-cinematic-auth-home`

Expected: PASS.

Run: `npm run smoke:cinematic-auth-home`

Expected: `status: ok` for desktop, mobile, reduced-motion, dialog, motion, and overlap checks.

- [ ] **Step 6: Commit deployment and smoke wiring**

```bash
git add Dockerfile docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md package.json scripts/smoke-cinematic-auth-home.ts scripts/smoke-cinematic-auth-home.test.ts
git commit -m "test: add cinematic auth home smoke coverage"
```

## Task 10: Complete Regression Validation and Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npx vitest --run src/auth/landing/landingFilmManifest.test.ts src/auth/landing/filmPlaybackPolicy.test.ts src/auth/landing/FilmStage.test.tsx src/auth/AuthDialog.test.tsx src/auth/authNavigation.test.ts src/auth/AuthPages.test.tsx src/app/routes.test.ts scripts/landing-film-pipeline.test.ts scripts/smoke-cinematic-auth-home.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full frontend build**

Run: `npm run build`

Expected: PASS; report any existing non-blocking Vite warnings separately.

- [ ] **Step 3: Run browser QA against the real published media base**

Run `npm run smoke:cinematic-auth-home` with `VITE_LANDING_MEDIA_BASE_URL` set to the published v1 CDN root.

Expected: PASS with nonblank, moving, correctly framed film evidence at desktop and mobile viewports.

- [ ] **Step 4: Attempt the complete test suite**

Run: `npm test`

Expected: PASS, or document exact unrelated historical failures using `docs/CODEX_HANDOFF.md`; do not hide or relabel failures.

- [ ] **Step 5: Update the project record**

Append a dated entry listing implemented files, public film manifest version, provider batch count, responsive/browser evidence, focused test totals, production build result, full-suite result, and any staging work that remains unperformed.

- [ ] **Step 6: Run final repository checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional task files are staged or modified. Preserve unrelated user changes.

- [ ] **Step 7: Commit the verified result**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record cinematic auth home rollout"
```

## Execution Notes

- Generate media only after the pipeline dry-run and pilot candidate pass. The user's approval covers use of the existing generation API for this homepage, but the script still requires the explicit cost flag to prevent accidental reruns.
- Never expose `LANDING_FILM_API_KEY`, CredentialVault values, Authorization headers, provider responses containing secrets, or S3 credentials to the browser, logs, reports, screenshots, or committed files.
- Do not stage `.codex-tmp`, generated masters, approval reports, or screenshots unless the user explicitly requests artifact versioning.
- Do not replace the v2 auth client or add legacy `/api/auth/*` calls.
- Do not add runtime generation, database tables, or billing mutations for anonymous visitors.
- Keep unrelated dirty worktree files untouched and stage each task by exact path.
