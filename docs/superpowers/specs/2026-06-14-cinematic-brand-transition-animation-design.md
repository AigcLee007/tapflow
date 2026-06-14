# Cinematic Brand Transition Animation Design

## Goal

Upgrade the current brand loading animation so it feels like a premium brand transition instead of a generic loading indicator.

The approved direction is:

- cinematic style
- balanced intensity
- logo visually enlarged to 2x
- light flow must move along the actual infinity shape in the logo
- center pulse should be present but restrained

## Visual Direction

This animation should feel like a brand system waking up, not like a spinner.

The overall tone is:

- dark, premium, controlled
- clearly branded
- smooth and luminous
- energetic without becoming noisy or game-like

The animation should keep the existing dark background language and use the infinity path as the main motion language.

## Motion Concept

The transition is built from four coordinated layers:

1. Background field
   - existing dark base and subtle grid remain
   - grid motion stays faint and secondary

2. Brand orb
   - the circular logo is enlarged to 2x the current transition size
   - the orb keeps its clean dark-glass look

3. Infinity energy path
   - a full-path glow sits exactly on the infinity shape
   - the path should read as energized, not dashed
   - a moving trail reinforces the direction of travel

4. Moving light particle
   - one primary bright particle travels along the exact infinity path
   - two faint delayed tail particles create a soft cinematic trail
   - the particle path must visibly hug the infinity shape itself

## Timing

The preferred loop is smooth and slightly luxurious rather than fast.

- total loop duration: about `2.25s`
- no abrupt jumps
- no hard flashes
- motion should feel continuous at the crossing point

The center pulse should happen twice per cycle, aligned with the visual rhythm of the infinity crossing, but kept subtle.

## Component Scope

The implementation remains inside the existing shared brand system:

- `src/app/brand/BrandMark.tsx`
- `src/app/brand/BrandTransition.tsx`
- `src/index.css`

No routing, auth, workspace, or canvas behavior changes are required for this iteration beyond consuming the improved shared animation.

## Technical Approach

The infinity animation should move from a dashed-stroke illusion to a real path-based animation.

Implementation direction:

- define one canonical SVG infinity path
- reuse that path for:
  - base track
  - energized path glow
  - moving trail stroke
  - SVG motion path for the primary particle
- use SVG `animateMotion` for the particle so movement follows the exact path
- keep reduced-motion support by disabling the moving particle and continuous path animation when motion reduction is requested

## Reduced Motion

When `prefers-reduced-motion: reduce` is active:

- disable particle travel
- disable continuous trail motion
- disable repeating grid drift
- keep a static large logo with a gentle glow

The reduced-motion version should still feel intentional and premium.

## Acceptance Criteria

This change is successful when:

- the transition logo appears visually about 2x larger than the current implementation
- the light point clearly moves along the infinity path itself
- the current dashed-running look is gone
- the center pulse is visible but not overpowering
- fullscreen and inline loading transitions both use the upgraded shared animation
- reduced-motion users get a calm non-traveling version

## Validation

Validation for this change should include:

- targeted brand component tests
- targeted transition tests
- `npm run build`
- visual inspection in the app on at least one fullscreen transition and one inline transition
