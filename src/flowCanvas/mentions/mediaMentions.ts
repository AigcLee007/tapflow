import type { FlowMediaMentionBinding, FlowMediaMentionKind } from '../types';

export type MediaMentionInput = {
  inputKey: string;
  kind: FlowMediaMentionKind;
};

export type MediaMentionTokenResolution = {
  binding: FlowMediaMentionBinding;
  status: 'valid' | 'invalid';
};

const localizedKindLabels: Record<FlowMediaMentionKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

const legacyKindByLabel: Record<string, FlowMediaMentionKind> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
};

export function allocateMediaMentionBinding({
  bindings,
  input,
  label,
}: {
  bindings?: unknown;
  input: MediaMentionInput;
  label?: string;
}): { bindings: FlowMediaMentionBinding[]; binding: FlowMediaMentionBinding } {
  const normalizedBindings = normalizeBindings(bindings);
  const existing = normalizedBindings.find((binding) => binding.inputKey === input.inputKey);
  if (existing) {
    if (existing.kind === input.kind && label && existing.label !== label) {
      const binding = { ...existing, label };
      return { bindings: normalizedBindings.map((item) => item.inputKey === input.inputKey ? binding : item), binding };
    }
    return { bindings: normalizedBindings, binding: existing };
  }

  const binding: FlowMediaMentionBinding = {
    inputKey: input.inputKey,
    kind: input.kind,
    label: label || `${localizedKindLabels[input.kind]}${nextLabelNumber(normalizedBindings, input.kind)}`,
  };
  return { bindings: [...normalizedBindings, binding], binding };
}

/**
 * Converts an old English token only where its ownership is provably unique.
 * Ambiguous tokens remain untouched so a later input reorder cannot retarget them.
 */
export function reconcileLegacyMediaMentionBindings({
  activeInputs,
  bindings,
  prompt,
}: {
  activeInputs: MediaMentionInput[];
  bindings?: unknown;
  prompt: string;
}): { bindings: FlowMediaMentionBinding[]; prompt: string } {
  let nextBindings = normalizeBindings(bindings);
  let nextPrompt = prompt;
  const activeByKind = new Map<FlowMediaMentionKind, MediaMentionInput[]>();
  for (const input of activeInputs) {
    const inputs = activeByKind.get(input.kind) ?? [];
    if (!inputs.some((candidate) => candidate.inputKey === input.inputKey)) inputs.push(input);
    activeByKind.set(input.kind, inputs);
  }

  nextPrompt = nextPrompt.replace(/@(?:Image|Video|Audio)\s+(\d+)(?=$|\s|[,.!?;:，。！？；：)\]}'"”’])/gi, (token, number: string) => {
    const kindName = token.match(/^@([a-z]+)\s+/i)?.[1]?.toLowerCase();
    const kind = kindName ? legacyKindByLabel[kindName] : undefined;
    if (!kind) return token;

    const candidates = activeByKind.get(kind) ?? [];
    if (candidates.length !== 1) return token;

    const candidate = candidates[0];
    const sameKeyBinding = nextBindings.find((binding) => binding.inputKey === candidate.inputKey);
    // A persisted key can only be reused when its media type still agrees with the active input.
    // Keeping an incompatible binding untouched is safer than rewriting a legacy token to it.
    if (sameKeyBinding && sameKeyBinding.kind !== kind) return token;
    const existing = sameKeyBinding?.kind === kind ? sameKeyBinding : undefined;
    const expectedLegacyNumber = existing
      ? existing.label.slice(localizedKindLabels[kind].length)
      : String(nextLabelNumber(nextBindings, kind));
    if (expectedLegacyNumber !== number) return token;

    const allocated = allocateMediaMentionBinding({ bindings: nextBindings, input: candidate });
    nextBindings = allocated.bindings;
    return `@${allocated.binding.label}`;
  });

  return { bindings: nextBindings, prompt: nextPrompt };
}

export function resolveMediaMentionToken({
  activeInputKeys,
  binding,
}: {
  activeInputKeys: Iterable<string>;
  binding: FlowMediaMentionBinding;
}): MediaMentionTokenResolution {
  const activeKeys = new Set(activeInputKeys);
  return { binding, status: activeKeys.has(binding.inputKey) ? 'valid' : 'invalid' };
}

function normalizeBindings(bindings?: unknown): FlowMediaMentionBinding[] {
  const unique = new Map<string, FlowMediaMentionBinding>();
  const candidates = Array.isArray(bindings) ? bindings : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const binding = candidate as Partial<FlowMediaMentionBinding>;
    const inputKey = typeof binding?.inputKey === 'string' ? binding.inputKey.trim() : '';
    const label = typeof binding?.label === 'string' ? binding.label.trim() : '';
    if (!inputKey || !label || !isMediaMentionKind(binding?.kind) || unique.has(inputKey)) continue;
    unique.set(inputKey, { inputKey, kind: binding.kind, label });
  }
  return [...unique.values()];
}

function nextLabelNumber(bindings: FlowMediaMentionBinding[], kind: FlowMediaMentionKind): number {
  const labelPrefix = localizedKindLabels[kind];
  return bindings.reduce((highest, binding) => {
    if (binding.kind !== kind) return highest;
    const match = binding.label.match(new RegExp(`^${labelPrefix}(\\d+)$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
}

function isMediaMentionKind(value: unknown): value is FlowMediaMentionKind {
  return value === 'image' || value === 'video' || value === 'audio';
}
