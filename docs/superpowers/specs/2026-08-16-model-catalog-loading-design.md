# Model Catalog Loading Recovery Design

## Goal

Prevent image, video, and text Flow nodes from remaining in a permanent loading state after an AI model route is disabled or a catalog request stalls.

## Decisions

- Catalog and per-model route reads have an 8-second frontend deadline. A timed-out read becomes a normal, retryable UI error; it never changes the configured model or route status.
- Video and text catalog assembly treats each model's route list independently. A failed route lookup omits only that model and leaves other available models selectable.
- The server-provided active image catalog is authoritative. Empty catalog results stay empty rather than injecting legacy hard-coded model options.
- Image-node route lookups only run for models currently present in the active catalog. A persisted selection for a disabled model is rendered as unavailable and cannot be generated.
- Empty, failed, and timed-out catalog states must settle loading and expose the existing retry affordance.

## Scope

The change is frontend-only. It changes no provider credentials, route configuration, persistence format, or billing behavior.

## Validation

Focused hook tests cover request timeout, partial catalog results, empty authoritative image catalog behavior, and no route request for a removed persisted model. The frontend production build validates TypeScript and the bundled UI.
