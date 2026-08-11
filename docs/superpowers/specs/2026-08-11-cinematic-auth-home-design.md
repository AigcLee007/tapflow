# TapFlow Cinematic Auth Home Design

**Date:** 2026-08-11

**Status:** Approved

**Primary goal:** Replace the current AI-SaaS-style login page with a visually distinctive, cinematic public entry that establishes TapFlow as a high-taste creative brand before asking the visitor to authenticate.

## 1. Product Intent

The anonymous `/login` experience should behave as an immersive brand film gallery rather than a product walkthrough. It must create a strong first impression through curated, silent, full-screen video chapters. It should not explain the canvas, show node diagrams, or narrate the creation process on the public page.

The page has two responsibilities:

1. Establish TapFlow as an imaginative, premium creative brand.
2. Provide a low-friction path into the existing authenticated workspace.

The existing v2 authentication contract, tenant handling, verification challenge, password recovery, registration, and `returnTo` behavior remain authoritative.

## 2. Experience Principles

- Lead with finished cinematic imagery, not interface chrome or abstract AI decoration.
- Use one coherent art direction across varied scenes so the page feels like a campaign, not a video demo reel.
- Keep copy short enough that the moving image remains the primary signal.
- Keep login available but visually subordinate until the visitor asks to start.
- Preserve a complete static experience when motion, bandwidth, decoding, or autoplay is unavailable.
- Use the video's own color as the palette. UI overlays use black, white, and neutral gray rather than cyan glow, purple gradients, or glass-heavy surfaces.

## 3. Page Structure

The page is a vertical sequence of four full-viewport film chapters. Each chapter uses a background video, restrained overlay copy, and a stable navigation layer. The next chapter should remain discoverable through scroll behavior and the chapter indicator, without adding instructional text.

### 3.1 Persistent Navigation

- Top left: TapFlow brand mark and wordmark.
- Top right: `登录` as a quiet text action.
- On authenticated sessions, the primary action routes directly to `/workspace`.
- Navigation remains legible over every film through local contrast treatment rather than a permanent large header surface.

### 3.2 Chapter One: Imagination Becomes Real

Visual direction: a realistic city at dawn begins to fold like paper; streets become suspended paths of light; the camera travels through an infinity shape formed by the environment.

Copy:

```text
TapFlow

让想象，成为现场。
```

Primary action: `开始创作`.

### 3.3 Chapter Two: Reality Can Be Rewritten

Visual direction: a real photography studio transforms continuously; a wall liquefies into an ocean surface, furniture loses gravity, and the human subject remains naturally grounded in the scene.

Copy:

```text
现实，不止一种版本。
```

### 3.4 Chapter Three: Ideas Have Their Own Form

Visual direction: a single subject transforms through glass, woven textile, liquid metal, and organic plant structures in one continuous camera movement with coherent lighting and cinematic depth of field.

Copy:

```text
每个念头，
都有自己的形状。
```

### 3.5 Chapter Four: Brand Resolution

Visual direction: the camera pulls away from a large surreal environment until the preceding spaces resolve into a restrained infinity form or the TapFlow brand mark.

Copy:

```text
下一幕，由你开始。
```

Primary action: `进入 TapFlow`.

## 4. Film Direction

The approved direction is surreal cinematic realism. The films should feel physically photographed even when the events are impossible. Avoid generic particles, robots, code rain, neon circuitry, galaxies, fast glitch cuts, text baked into footage, and other common AI-product imagery.

All chapters share these characteristics:

- continuous, confident camera motion;
- realistic lighting and material response;
- controlled black levels and exposure behind overlay copy;
- a restrained film-grain treatment;
- no flashing transitions or high-frequency edits;
- no dialogue, captions, logos, or watermark inside generated footage;
- a loop point that does not produce a visible jump.

Chapter transitions use an approximately 600 ms dark dissolve. A fixed right-side indicator uses four fine line marks rather than carousel dots. The active line expands subtly. The bottom-right playback control uses familiar play and pause icons with a tooltip and accessible label.

## 5. Responsive Composition

Each approved shot requires separately composed desktop and mobile variants:

- desktop target: 16:9;
- mobile target: 9:16;
- tablet may select the closest source using media conditions and `object-fit: cover`;
- text and action safe zones must be included in the generation brief;
- mobile is not produced by mechanically cropping the desktop master.

Hero typography uses fixed responsive breakpoints rather than viewport-scaled font sizing. The first viewport must identify `TapFlow` as the brand. Long text must not cover the principal subject at supported viewport sizes.

## 6. Authentication Overlay

Authentication opens over the current film rather than navigating to a visually separate form page. When the overlay opens:

- the active film slows to approximately 0.35x where browser behavior permits;
- a darker backdrop and modest depth blur separate the form from the film;
- focus moves into the dialog and remains trapped until it closes;
- outside click and Escape close the dialog, except while a submission is pending;
- closing returns focus to the control that opened the dialog.

Desktop dialog:

- approximately 880 px wide;
- two columns, with a 38% media still area and a 62% form area;
- near-black solid surface, neutral border, compact 8 px radius;
- no cyan glow, decorative glass surface, or nested cards.

Mobile dialog:

- omit the media column;
- enter as a bottom-aligned sheet within safe-area bounds;
- allow the form body to scroll without moving the page behind it.

The following states remain inside the same overlay shell:

- email/password login;
- account registration;
- email or new-device verification;
- forgot-password request and completion;
- submitting and field-level errors.

Authentication must keep the existing v2 clients and `returnTo` behavior. Authenticated visitors bypass the dialog and route to `/workspace`.

Direct visits to `/register` and `/forgot-password` remain supported product routes. They render the same cinematic page with the corresponding overlay state already open. Closing a route-initialized overlay navigates to `/login`; closing an overlay opened from a `/login` CTA returns to the underlying film without changing routes.

## 7. Component Boundaries

The implementation should separate visual media behavior from authentication behavior:

- `CinematicAuthHome`: owns chapter selection, navigation, CTA routing, and dialog-open state.
- `FilmChapter`: renders one chapter's source set, poster, overlay copy, and playback state.
- `FilmStage`: ensures only the active film plays and coordinates preloading of the adjacent chapter.
- `ChapterRail`: accessible chapter status and direct navigation.
- `AuthDialog`: dialog semantics, focus management, dismissal, and responsive shell.
- Existing auth form content: retained and adapted so login, registration, verification, and recovery are not reimplemented.
- `landingFilmManifest`: versioned content data containing chapter copy, posters, desktop sources, mobile sources, and variants.

No new production dependency is required unless the existing dialog/focus primitives prove insufficient during implementation.

## 8. Film Production Pipeline

The existing video-generation API is used offline or through an explicit content-production script. It must not generate a new film for each page visitor.

The first release produces:

```text
12 creative shots = 4 chapters x 3 curated variants
24 encoded compositions = each shot in one desktop and one mobile composition
```

Each clip is 8-12 seconds and silent. Generated candidates go through manual visual review before being added to the manifest. The publishing pipeline produces:

- MP4/H.264 primary source;
- WebM alternative when encoding support is available;
- full-resolution poster;
- lightweight placeholder;
- stable, versioned public media URLs.

Approved films should live in an object-storage public brand-media prefix backed by a stable CDN URL. They must not use expiring signed asset URLs and must not be stored in canvas graph JSON. Manifest versions such as `landing-film-v1` allow media replacement without changing authentication logic.

## 9. Loading and Playback

- Render the first poster immediately.
- Load only the first low-bitrate film during initial page startup.
- Preload the next chapter when it approaches the viewport.
- Play and decode only one film at a time; pause films that leave the active chapter.
- Preserve the current poster or last stable frame while the next source loads.
- Use static posters for load failures, data-saving connections, and reduced-motion preferences.
- Do not show a spinner over the brand hero.
- Randomly select one coherent four-film variant set per page session without using local storage as authoritative state.
- Keep the selected set stable for the current visit.

Initial performance targets:

- first visual poster visible in approximately 1.5 seconds on a representative mobile connection;
- initial transfer target of approximately 2 MB before user interaction;
- no horizontal overflow or layout shift caused by film metadata loading;
- no simultaneous download or decode of all 12 source films.

## 10. Failure and Accessibility Behavior

- Missing or failed video: keep the poster and all navigation/auth actions operational.
- Autoplay rejected: display the poster and an accessible play control.
- Reduced motion: use static chapter posters with simple opacity changes.
- Keyboard: chapter controls, login triggers, playback control, form, and dialog close are fully reachable.
- Screen readers: decorative films are hidden; chapter headings and state remain available as text.
- Contrast: copy and controls must meet readable contrast over every approved poster and representative film frame.
- Dialog: use correct accessible naming, focus trapping, focus return, and Escape behavior.

## 11. Verification

Focused component tests should cover:

- active chapter selection and one-video-at-a-time playback;
- adjacent-film preloading rather than eager loading all assets;
- poster fallback after a media error;
- reduced-motion and data-saving fallbacks;
- authenticated CTA routing to `/workspace`;
- anonymous CTA opening the authentication dialog;
- login, registration, verification, reset, `returnTo`, error, and pending states;
- dialog focus trap, close behavior, and focus restoration.

Browser QA should verify desktop and mobile viewports with screenshots and playback-state checks. It must confirm that the visible film is nonblank, correctly framed, moving, and free of overlapping text or controls. Production build validation remains required.

## 12. Non-Goals

- No public product walkthrough, canvas demonstration, or feature-card grid.
- No runtime video generation for anonymous visitors.
- No pricing section in the first release.
- No sound-on-by-default behavior.
- No restoration of legacy auth APIs or browser-authoritative persistence.
- No change to workspace, canvas, asset, billing, or AI Gateway product architecture.

## 13. Acceptance Criteria

The design is complete when:

- anonymous `/login` presents four coherent full-screen cinematic chapters;
- the first viewport clearly identifies TapFlow and exposes a start action;
- login no longer occupies the first-screen layout before user intent;
- all existing v2 auth states work inside the new overlay;
- authenticated visitors enter `/workspace` directly;
- motion gracefully falls back to reviewed still imagery;
- desktop and mobile use intentionally composed media;
- performance targets and one-video-at-a-time behavior are verified;
- no secret, signed asset URL, or generated media payload is exposed in frontend state beyond stable public brand-media URLs.
