# Director Desk Three Viewport Phase 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3D Director Desk CSS placeholder viewport with a real Three.js canvas that renders the director grid, actor placeholders, and camera markers.

**Architecture:** Add a focused `DirectorDeskThreeViewport` component under `src/flowCanvas/studios/`. `ProductionStudioShell` passes normalized actors, cameras, and current selection into this component. The Three.js viewport is visual/staging-only and does not mutate drafts, create assets, run AI workflows, export media, or touch billing.

**Tech Stack:** React, TypeScript, Three.js, Testing Library, Vitest, Playwright CLI for browser pixel smoke.

---

## Scope

- Create a real Three.js renderer inside the Director Desk central viewport.
- Render:
  - grid floor
  - axis helper
  - actor placeholder meshes from `director3d.actors`
  - camera marker meshes from `director3d.cameras`
  - a subtle continuous camera/scene render loop so the canvas is not static-empty
- Keep a graceful fallback host if WebGL cannot initialize in jsdom or a constrained browser.
- Keep the canvas full-bleed inside the existing central viewport panel, not inside a decorative card.
- Add unit coverage for shell integration and component host metadata.
- Add Playwright smoke using a temporary `output/playwright/director-viewport-smoke.html` Vite harness to check nonblank canvas pixels on desktop and mobile viewport sizes.

## File Map

- Create: `src/flowCanvas/studios/DirectorDeskThreeViewport.tsx`
- Create: `src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `PROJECT_RECORD.md`
- Temporary verification artifact, not committed: `output/playwright/director-viewport-smoke.html`

## Task 1: Viewport Unit Tests

- [ ] **Step 1: Write failing component test**

Create `src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DirectorDeskThreeViewport } from './DirectorDeskThreeViewport';

describe('DirectorDeskThreeViewport', () => {
  it('renders a director viewport host with actor and camera metadata', () => {
    render(
      <DirectorDeskThreeViewport
        actors={[
          {
            id: 'actor-1',
            name: '角色 A',
            kind: 'placeholder_humanoid',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
            locked: false,
          },
        ]}
        cameras={[
          {
            id: 'camera-1',
            name: '主镜头',
            position: [0, 2, 6],
            target: [0, 1, 0],
          },
        ]}
        selectedId="actor-1"
        selectedType="actor"
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport).toHaveAttribute('data-actor-count', '1');
    expect(viewport).toHaveAttribute('data-camera-count', '1');
    expect(viewport).toHaveAttribute('data-selected-id', 'actor-1');
  });
});
```

- [ ] **Step 2: Write failing shell integration assertion**

Update `src/flowCanvas/studios/ProductionStudioShell.test.tsx` in the existing director render test:

```tsx
expect(screen.getByTestId('director-three-viewport')).toHaveAttribute('data-actor-count', '1');
expect(screen.getByTestId('director-three-viewport')).toHaveAttribute('data-camera-count', '1');
```

- [ ] **Step 3: Run tests to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because `DirectorDeskThreeViewport` does not exist and the shell still renders the CSS placeholder.

## Task 2: Three.js Viewport Implementation

- [ ] **Step 1: Implement `DirectorDeskThreeViewport`**

Create `src/flowCanvas/studios/DirectorDeskThreeViewport.tsx`:

- Export `DirectorDeskThreeViewport`.
- Props:

```ts
actors: FlowDirector3dData['actors'];
cameras: FlowDirector3dData['cameras'];
selectedId: string | null;
selectedType: 'actor' | 'camera' | 'shot' | null;
```

- Use `useRef` and `useEffect` to create and clean up:
  - `THREE.Scene`
  - `THREE.PerspectiveCamera`
  - `THREE.WebGLRenderer`
  - `THREE.GridHelper`
  - `THREE.AxesHelper`
  - actor meshes and camera marker meshes
- Catch renderer initialization errors and keep the host mounted with `data-renderer="fallback"`.
- Dispose geometries/materials and remove the renderer canvas during cleanup.

- [ ] **Step 2: Wire shell to the viewport**

Update `ProductionStudioShell.tsx`:

- Import `DirectorDeskThreeViewport`.
- Replace the central placeholder `actorMarkerStyle` / `cameraMarkerStyle` divs with:

```tsx
<DirectorDeskThreeViewport
  actors={actors}
  cameras={cameras}
  selectedId={selected?.id ?? null}
  selectedType={selected?.type ?? null}
/>
```

- Keep the existing viewport header and grid-visible pill.

- [ ] **Step 3: Run unit tests to verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 3: Validation And Browser Pixel Smoke

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

- [ ] **Step 3: Verify Playwright prerequisite**

Run:

```bash
Get-Command npx
```

Expected: returns an `npx` command path.

- [ ] **Step 4: Create temporary Vite smoke harness**

Create `output/playwright/director-viewport-smoke.html` as an uncommitted artifact that imports React and `DirectorDeskThreeViewport` through Vite and renders one actor plus one camera.

- [ ] **Step 5: Run Playwright desktop and mobile pixel checks**

Start a Vite dev server on an available local port, open the harness in Chromium, and run a script that:

- waits for `canvas`
- samples center canvas pixels
- verifies at least one sampled pixel is nontransparent/nonblack
- captures screenshots under `output/playwright/`
- repeats for a desktop viewport and a mobile viewport

## Task 4: Record And Commit

- [ ] **Step 1: Update `PROJECT_RECORD.md`**

Add a 2026-07-05 entry for the Three.js Director Desk viewport, including tests, build, and Playwright pixel smoke results.

- [ ] **Step 2: Commit relevant source/docs changes**

Run:

```bash
git add docs/superpowers/plans/2026-07-05-director-desk-three-viewport-phase-7.md src/flowCanvas/studios/DirectorDeskThreeViewport.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx PROJECT_RECORD.md
git commit -m "feat: add director desk three viewport"
```
