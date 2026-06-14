# Cinematic Brand Transition Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dashed infinity loading effect with a larger cinematic brand transition where a glowing particle travels along the actual infinity path.

**Architecture:** Keep the work inside the existing shared brand components. `BrandMark` becomes the source of truth for the path-based animation layers, `BrandTransition` keeps the same API but renders the upgraded mark, and `src/index.css` owns the motion system and reduced-motion fallback.

**Tech Stack:** React, TypeScript, SVG motion primitives, shared global CSS in `src/index.css`, Vitest, React Testing Library.

---

### Task 1: Lock the new brand animation structure with tests

**Files:**
- Modify: `src/app/brand/BrandMark.test.tsx`
- Modify: `src/app/brand/BrandTransition.test.tsx`

- [ ] Add failing tests that require:
  - a dedicated orb test id
  - a moving particle layer
  - a center pulse layer
  - the large transition mark to use the enlarged size

- [ ] Run:

```bash
npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx
```

Expected: fail before implementation because the new animation layers do not exist yet.

### Task 2: Rebuild `BrandMark` around one canonical infinity path

**Files:**
- Modify: `src/app/brand/BrandMark.tsx`

- [ ] Add a shared infinity path constant that starts from the visual crossing area.
- [ ] Add explicit animation layers:
  - base path
  - energized full-path glow
  - moving trail path
  - main particle
  - delayed tail particles
  - center pulse
- [ ] Expose stable test ids for the new layers.

### Task 3: Upgrade the motion system and transition scale

**Files:**
- Modify: `src/index.css`
- Modify: `src/app/brand/BrandTransition.tsx`

- [ ] Enlarge the `large` brand-mark size to approximately 2x the current transition mark.
- [ ] Replace the dashed-run animation with:
  - full-path glow
  - orbiting trail
  - restrained pulse timing
- [ ] Tune transition layout so the larger mark still fits fullscreen and inline states.
- [ ] Preserve reduced-motion behavior with a static premium fallback.

### Task 4: Verify, record, and ship

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] Run:

```bash
npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx
npm run build
git diff --check
```

- [ ] Add a project-record entry for the cinematic brand transition refinement.
- [ ] Commit only the touched docs, brand animation files, tests, and project record.
- [ ] Push `main` to GitHub.
