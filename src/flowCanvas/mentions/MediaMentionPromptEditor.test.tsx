import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor, type TextNode } from 'lexical';
import type { FlowMediaMentionBinding } from '../types';
import type { MediaMentionCandidate } from './mediaMentionCandidates';
import { MediaMentionPromptEditor } from './MediaMentionPromptEditor';

const imageCandidate: MediaMentionCandidate = {
  activation: { type: 'asset', assetId: 'image' },
  candidateKey: 'asset:image',
  mediaKind: 'image',
  title: 'Mountain image',
};

const videoCandidate: MediaMentionCandidate = {
  activation: { type: 'canvas', nodeId: 'video-node' },
  candidateKey: 'canvas:video-node',
  mediaKind: 'video',
  title: 'Road video',
};

const imageBinding: FlowMediaMentionBinding = { inputKey: 'asset:image', kind: 'image', label: '图片1' };

function renderEditor(overrides: Partial<React.ComponentProps<typeof MediaMentionPromptEditor>> = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const onActivateCandidate = overrides.onActivateCandidate ?? vi.fn(async () => ({ inputKey: 'asset:image', kind: 'image' as const }));
  render(
    <MediaMentionPromptEditor
      activeInputKeys={new Set(['asset:image'])}
      bindings={[]}
      candidates={[imageCandidate, videoCandidate]}
      densityVariant="image"
      onActivateCandidate={onActivateCandidate}
      onChange={onChange}
      placeholder="生成提示词"
      value=""
      {...overrides}
    />,
  );
  return { onActivateCandidate, onChange };
}

async function renderEditorWithLexicalPrompt(prompt: string, caretOffset: number, overrides: Partial<React.ComponentProps<typeof MediaMentionPromptEditor>> = {}) {
  let lexicalEditor: LexicalEditor | undefined;
  const result = renderEditor({ ...overrides, onEditorReady: (editor) => { lexicalEditor = editor; } });
  await waitFor(() => expect(lexicalEditor).toBeTruthy());
  act(() => {
    lexicalEditor!.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      const text = $createTextNode(prompt);
      paragraph.append(text);
      root.append(paragraph);
      text.select(caretOffset, caretOffset);
    }, { discrete: true });
  });
  return { ...result, editor: lexicalEditor! };
}

describe('MediaMentionPromptEditor', () => {
  it('opens media-only candidates for @ and activates the keyboard selection', async () => {
    const { onActivateCandidate, onChange } = await renderEditorWithLexicalPrompt('@', 1);
    const editor = screen.getByRole('textbox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();

    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(onActivateCandidate).toHaveBeenCalledWith(imageCandidate));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      value: '@图片1 ',
      bindings: [imageBinding],
    })));
  });

  it('does not open or accept candidates during IME composition', () => {
    renderEditor();
    const editor = screen.getByRole('textbox', { name: '生成提示词' });
    fireEvent.compositionStart(editor);
    editor.textContent = '@';
    fireEvent.input(editor, { data: '@', inputType: 'insertCompositionText', isComposing: true });
    expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull();
    fireEvent.compositionEnd(editor);
  });

  it('deleting a mention changes prompt text without activating or removing its input', async () => {
    const onChange = vi.fn();
    const onActivateCandidate = vi.fn();
    renderEditor({ value: 'scene @图片1 ', bindings: [imageBinding], onChange, onActivateCandidate });

    fireEvent.mouseEnter(await screen.findByText('@图片1'));
    fireEvent.click(await screen.findByRole('button', { name: '删除引用 图片1' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ value: 'scene ', bindings: [imageBinding] }));
    expect(onActivateCandidate).not.toHaveBeenCalled();
  });

  it('renders a removed input binding as an invalid warning mention', async () => {
    renderEditor({ value: 'scene @图片1', bindings: [imageBinding], activeInputKeys: new Set() });
    expect((await screen.findByText('@图片1')).parentElement?.getAttribute('data-invalid')).toBe('true');
  });

  it('filters candidates, cycles selection, and dismisses on escape and outside pointer down', async () => {
    await renderEditorWithLexicalPrompt('@road', 5);
    const editor = screen.getByRole('textbox', { name: '生成提示词' });
    expect(await screen.findByRole('option', { name: /Road video/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Mountain image/i })).toBeNull();

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull());

    await renderEditorWithLexicalPrompt('@', 1);
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull());
  });

  it('opens and inserts at the current Lexical caret inside a prompt instead of trailing text', async () => {
    const { onChange } = await renderEditorWithLexicalPrompt('before @mo after', 10);
    const editor = screen.getByRole('textbox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();

    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 'before @图片1  after' })));
  });

  it('does not insert an async selection into a newer trailing @ query', async () => {
    let resolveActivation: ((value: { inputKey: string; kind: 'image' }) => void) | undefined;
    const activation = vi.fn(() => new Promise<{ inputKey: string; kind: 'image' }>((resolve) => { resolveActivation = resolve; }));
    const { editor, onChange } = await renderEditorWithLexicalPrompt('before @mo after', 10, { onActivateCandidate: activation });
    const editorElement = screen.getByRole('textbox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();
    fireEvent.keyDown(editorElement, { key: 'Enter' });
    await waitFor(() => expect(activation).toHaveBeenCalled());

    act(() => {
      editor.update(() => {
        const root = $getRoot();
        const text = root.getFirstDescendant() as TextNode;
        text.setTextContent('before @mo after @later');
        text.select(23, 23);
      }, { discrete: true });
    });
    await act(async () => resolveActivation?.({ inputKey: 'asset:image', kind: 'image' }));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ value: expect.stringContaining('@图片1') }));
  });

  it('treats duplicate persisted labels as invalid instead of resolving one binding', async () => {
    renderEditor({
      value: '@图片1',
      bindings: [imageBinding, { inputKey: 'asset:other', kind: 'image', label: '图片1' }],
      activeInputKeys: new Set(['asset:image', 'asset:other']),
    });
    expect((await screen.findByText('@图片1')).parentElement?.getAttribute('data-invalid')).toBe('true');
  });
});
