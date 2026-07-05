import type { FlowImageGenerationMode } from '../types';
import { normalizeImageGenerationMode } from './imageGenerationModes';
import type { RuntimeRouteOption } from './runtimeRouteOptions';
import { normalizeSupportedImageGenerationModes } from './runtimeRouteOptions';

export type ImageGenerationModeRunBlocker = {
  code: 'PRICING_NOT_FOUND' | 'UNSUPPORTED_GENERATION_MODE';
  message: string;
};

function isProductionImageGenerationMode(mode: FlowImageGenerationMode): boolean {
  return mode !== 'standard';
}

export function resolveSupportedImageGenerationModes(
  route: Pick<RuntimeRouteOption, 'supportedGenerationModes'> | null | undefined,
): FlowImageGenerationMode[] {
  return normalizeSupportedImageGenerationModes(route?.supportedGenerationModes);
}

export function isImageGenerationModeSupportedByRoute(
  modeInput: unknown,
  route: Pick<RuntimeRouteOption, 'supportedGenerationModes'> | null | undefined,
): boolean {
  const mode = normalizeImageGenerationMode(modeInput);
  if (mode === 'standard') {
    return true;
  }
  return resolveSupportedImageGenerationModes(route).includes(mode);
}

export function resolveImageGenerationModeRunBlocker(input: {
  mode: unknown;
  route: Pick<RuntimeRouteOption, 'estimatedCredits' | 'minChargeCredits' | 'routeKey' | 'supportedGenerationModes'> | null | undefined;
}): ImageGenerationModeRunBlocker | null {
  const mode = normalizeImageGenerationMode(input.mode);
  if (!isProductionImageGenerationMode(mode)) {
    return null;
  }

  const routeKey = input.route?.routeKey || 'unknown';
  if (!isImageGenerationModeSupportedByRoute(mode, input.route)) {
    return {
      code: 'UNSUPPORTED_GENERATION_MODE',
      message: `UNSUPPORTED_GENERATION_MODE: Route ${routeKey} does not support ${mode}.`,
    };
  }

  const estimatedCredits =
    typeof input.route?.estimatedCredits === 'number' && input.route.estimatedCredits > 0
      ? input.route.estimatedCredits
      : typeof input.route?.minChargeCredits === 'number' && input.route.minChargeCredits > 0
        ? input.route.minChargeCredits
        : null;
  if (!estimatedCredits) {
    return {
      code: 'PRICING_NOT_FOUND',
      message: `PRICING_NOT_FOUND: Route ${routeKey} has no active pricing for ${mode}.`,
    };
  }

  return null;
}
