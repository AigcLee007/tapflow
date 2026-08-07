import { describe, expect, it } from 'vitest';

import {
  allocateMediaMentionBinding,
  reconcileLegacyMediaMentionBindings,
  resolveMediaMentionToken,
  type MediaMentionInput,
} from './mediaMentions';

const imageA: MediaMentionInput = { inputKey: 'asset:image-a', kind: 'image' };
const imageB: MediaMentionInput = { inputKey: 'upstream:image-b', kind: 'image' };
const videoA: MediaMentionInput = { inputKey: 'asset:video-a', kind: 'video' };

describe('media mention bindings', () => {
  it('allocates localized labels monotonically for each media kind', () => {
    const first = allocateMediaMentionBinding({ bindings: [], input: imageA });
    const second = allocateMediaMentionBinding({ bindings: first.bindings, input: videoA });
    const third = allocateMediaMentionBinding({ bindings: second.bindings, input: imageB });

    expect(third.bindings).toEqual([
      { inputKey: 'asset:image-a', kind: 'image', label: '图片1' },
      { inputKey: 'asset:video-a', kind: 'video', label: '视频1' },
      { inputKey: 'upstream:image-b', kind: 'image', label: '图片2' },
    ]);
    expect(third.binding).toEqual({ inputKey: 'upstream:image-b', kind: 'image', label: '图片2' });
  });

  it('reuses the existing binding by input key without changing its label', () => {
    const existing = [{ inputKey: imageA.inputKey, kind: 'image' as const, label: '图片7' }];

    const result = allocateMediaMentionBinding({ bindings: existing, input: { ...imageA, kind: 'video' } });

    expect(result.bindings).toEqual(existing);
    expect(result.binding).toEqual(existing[0]);
  });

  it('reconciles a legacy @Image number only when exactly one active image can own it', () => {
    const result = reconcileLegacyMediaMentionBindings({
      activeInputs: [imageA],
      bindings: [],
      prompt: 'Use @Image 1 as the reference.',
    });

    expect(result).toEqual({
      bindings: [{ inputKey: imageA.inputKey, kind: 'image', label: '图片1' }],
      prompt: 'Use @图片1 as the reference.',
    });
  });

  it('does not reconcile an ambiguous legacy @Image number', () => {
    const result = reconcileLegacyMediaMentionBindings({
      activeInputs: [imageA, imageB],
      bindings: [],
      prompt: 'Use @Image 1 as the reference.',
    });

    expect(result).toEqual({ bindings: [], prompt: 'Use @Image 1 as the reference.' });
  });

  it('does not create a binding when a legacy number cannot belong to the only active input', () => {
    const result = reconcileLegacyMediaMentionBindings({
      activeInputs: [imageA],
      bindings: [],
      prompt: 'Use @Image 2 as the reference.',
    });

    expect(result).toEqual({ bindings: [], prompt: 'Use @Image 2 as the reference.' });
  });

  it('marks a removed input token invalid instead of silently rebinding it', () => {
    const binding = { inputKey: imageA.inputKey, kind: 'image' as const, label: '图片1' };

    expect(resolveMediaMentionToken({ activeInputKeys: [imageB.inputKey], binding })).toEqual({
      binding,
      status: 'invalid',
    });
  });

  it('resolves a token when its original input key remains active', () => {
    const binding = { inputKey: imageA.inputKey, kind: 'image' as const, label: '图片1' };

    expect(resolveMediaMentionToken({ activeInputKeys: [imageA.inputKey, imageB.inputKey], binding })).toEqual({
      binding,
      status: 'valid',
    });
  });
});
