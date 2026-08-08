import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
  const result = render(
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
  return { ...result, onActivateCandidate, onChange };
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
  it('renders the runtime thumbnail for a media mention capsule', async () => {
    renderEditor({
      activeInputKeys: new Set(['asset:image']),
      bindings: [{ inputKey: 'asset:image', kind: 'image', label: '图片1' }],
      previewUrlsByInputKey: { 'asset:image': '/thumb-image.webp' },
      value: '@图片1',
    });

    const thumbnail = await screen.findByRole('img', { name: '图片1' });
    expect(thumbnail.getAttribute('src')).toBe('/thumb-image.webp');
  });
  beforeAll(() => {
    if (typeof Selection !== 'undefined' && typeof Selection.prototype.modify !== 'function') {
      Object.defineProperty(Selection.prototype, 'modify', { configurable: true, value: () => undefined });
    }
  });

  it('opens media-only candidates for @ and activates the keyboard selection', async () => {
    const { onActivateCandidate, onChange } = await renderEditorWithLexicalPrompt('@', 1);
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();

    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(onActivateCandidate).toHaveBeenCalledWith(imageCandidate));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      value: '@图片1 ',
      bindings: [imageBinding],
    })));
  });

  it('opens the menu when the first @ leaves Lexical on an element selection', async () => {
    let lexicalEditor: LexicalEditor | undefined;
    const onChange = vi.fn();
    renderEditor({ onChange, onEditorReady: (editor) => { lexicalEditor = editor; } });
    await waitFor(() => expect(lexicalEditor).toBeTruthy());
    act(() => {
      lexicalEditor!.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('@'));
        root.append(paragraph);
        paragraph.selectEnd();
      }, { discrete: true });
    });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();
  });
  it('does not open or accept candidates during IME composition', () => {
    renderEditor();
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
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
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
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
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();

    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 'before @图片1  after' })));
  });

  it('does not insert an async selection into a newer trailing @ query', async () => {
    let resolveActivation: ((value: { inputKey: string; kind: 'image' }) => void) | undefined;
    const activation = vi.fn(() => new Promise<{ inputKey: string; kind: 'image' }>((resolve) => { resolveActivation = resolve; }));
    const { editor, onChange } = await renderEditorWithLexicalPrompt('before @mo after', 10, { onActivateCandidate: activation });
    const editorElement = screen.getByRole('combobox', { name: '生成提示词' });
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

  it('parses an externally controlled prompt with its current bindings and active keys', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MediaMentionPromptEditor
        activeInputKeys={new Set(['asset:old'])}
        bindings={[{ inputKey: 'asset:old', kind: 'image', label: '图片1' }]}
        candidates={[imageCandidate]}
        densityVariant="image"
        onActivateCandidate={vi.fn()}
        onChange={onChange}
        placeholder="生成提示词"
        value="draft"
      />,
    );
    rerender(
      <MediaMentionPromptEditor
        activeInputKeys={new Set(['asset:new'])}
        bindings={[{ inputKey: 'asset:new', kind: 'image', label: '图片1' }]}
        candidates={[imageCandidate]}
        densityVariant="image"
        onActivateCandidate={vi.fn()}
        onChange={onChange}
        placeholder="生成提示词"
        value="external @图片1"
      />,
    );

    const mention = await screen.findByText('@图片1');
    expect(mention.parentElement?.getAttribute('data-invalid')).toBeNull();
    fireEvent.mouseEnter(mention);
    expect(await screen.findByRole('button', { name: '删除引用 图片1' })).toBeTruthy();
  });

  it('anchors the active menu to its owning editor and dismisses it without affecting another editor', async () => {
    const editors: LexicalEditor[] = [];
    render(
      <>
        <MediaMentionPromptEditor activeInputKeys={new Set(['asset:image'])} bindings={[]} candidates={[imageCandidate]} densityVariant="image" onActivateCandidate={vi.fn()} onChange={vi.fn()} onEditorReady={(editor) => editors.push(editor)} placeholder="第一个提示词" value="" />
        <MediaMentionPromptEditor activeInputKeys={new Set(['asset:image'])} bindings={[]} candidates={[imageCandidate]} densityVariant="image" onActivateCandidate={vi.fn()} onChange={vi.fn()} onEditorReady={(editor) => editors.push(editor)} placeholder="第二个提示词" value="" />
      </>,
    );
    await waitFor(() => expect(editors).toHaveLength(2));
    const editorElements = screen.getAllByRole('combobox');
    Object.defineProperty(editorElements[0], 'getBoundingClientRect', { value: () => new DOMRect(20, 40, 220, 32) });
    Object.defineProperty(editorElements[1], 'getBoundingClientRect', { value: () => new DOMRect(480, 240, 220, 32) });
    await act(async () => {
      editors[1].update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        const text = $createTextNode('@');
        paragraph.append(text);
        root.clear();
        root.append(paragraph);
        text.selectEnd();
      }, { discrete: true });
    });
    const menu = await screen.findByRole('listbox', { name: '引用媒体' });
    expect(menu.style.left).toBe('480px');
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull());
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('makes a disabled editor non-editable and prevents keyboard or pill removal changes', async () => {
    const onChange = vi.fn();
    let lexicalEditor: LexicalEditor | undefined;
    renderEditor({
      disabled: true,
      value: 'scene @图片1',
      bindings: [imageBinding],
      onChange,
      onEditorReady: (editor) => { lexicalEditor = editor; },
    });
    await waitFor(() => expect(lexicalEditor).toBeTruthy());
    onChange.mockClear();
    expect(lexicalEditor!.isEditable()).toBe(false);
    const editorElement = screen.getByRole('combobox', { name: '生成提示词' });
    expect(editorElement.getAttribute('contenteditable')).toBe('false');
    const removeButton = await screen.findByRole('button', { name: '删除引用 图片1' });
    expect((removeButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(removeButton, { key: 'Enter' });
    fireEvent.click(removeButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['image', 'video'] as const)('stops %s editor Backspace/Delete propagation when the mention menu is closed', (densityVariant) => {
    renderEditor({ densityVariant, candidates: [] });
    const editor = screen.getByRole('combobox');
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);

    fireEvent.keyDown(editor, { key: 'Backspace' });
    fireEvent.keyDown(editor, { key: 'Delete' });

    expect(windowKeydown).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowKeydown);
  });

  it.each(['image', 'video'] as const)('delegates %s editor Backspace to Lexical instead of the canvas shortcut', async (densityVariant) => {
    const { editor } = await renderEditorWithLexicalPrompt('go', 2, { densityVariant, candidates: [] });
    const editorElement = screen.getByRole('combobox');

    const event = createEvent.keyDown(editorElement, { key: 'Backspace' });
    fireEvent(editorElement, event);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('go');
  });

  it.each(['image', 'video'] as const)('inserts a media mention with Enter in the %s editor', async (densityVariant) => {
    const { onActivateCandidate, onChange } = await renderEditorWithLexicalPrompt('@', 1, { densityVariant });
    const editor = screen.getByRole('combobox');

    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => expect(onActivateCandidate).toHaveBeenCalledWith(imageCandidate));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      value: '@图片1 ',
      bindings: [imageBinding],
    })));
  });

  it('keeps the query usable and announces a recoverable activation failure', async () => {
    const activation = vi.fn(async () => { throw new Error('素材暂不可用'); });
    await renderEditorWithLexicalPrompt('@', 1, { onActivateCandidate: activation });
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    expect(await screen.findByRole('listbox', { name: '引用媒体' })).toBeTruthy();
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toContain('素材暂不可用');
    expect(screen.getByRole('listbox', { name: '引用媒体' })).toBeTruthy();
    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(activation).toHaveBeenCalledTimes(2));
  });

  it('publishes combobox and active option relationships while the mention menu is open', async () => {
    await renderEditorWithLexicalPrompt('@', 1);
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    const menu = await screen.findByRole('listbox', { name: '引用媒体' });
    expect(editor.getAttribute('aria-autocomplete')).toBe('list');
    expect(editor.getAttribute('aria-expanded')).toBe('true');
    expect(editor.getAttribute('aria-controls')).toBe(menu.id);
    expect(editor.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    await waitFor(() => expect(editor.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id));
  });

  it('closes an open menu and clears its active ARIA state when the editor becomes disabled', async () => {
    const activation = vi.fn(async () => { throw new Error('素材不可用'); });
    const { rerender } = await renderEditorWithLexicalPrompt('@', 1, { onActivateCandidate: activation });
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    const menu = await screen.findByRole('listbox', { name: '引用媒体' });
    expect(editor.getAttribute('aria-controls')).toBe(menu.id);
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toContain('素材不可用');

    rerender(
      <MediaMentionPromptEditor
        activeInputKeys={new Set(['asset:image'])}
        bindings={[]}
        candidates={[imageCandidate, videoCandidate]}
        densityVariant="image"
        disabled
        onActivateCandidate={vi.fn()}
        onChange={vi.fn()}
        placeholder="生成提示词"
        value="@"
      />,
    );

    await waitFor(() => expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(editor.getAttribute('aria-expanded')).toBe('false');
    expect(editor.getAttribute('aria-controls')).toBeNull();
    expect(editor.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('closes an open menu when the current query has no remaining candidates', async () => {
    const { rerender } = await renderEditorWithLexicalPrompt('@road', 5);
    const editor = screen.getByRole('combobox', { name: '生成提示词' });
    const menu = await screen.findByRole('listbox', { name: '引用媒体' });
    expect(editor.getAttribute('aria-controls')).toBe(menu.id);

    rerender(
      <MediaMentionPromptEditor
        activeInputKeys={new Set(['asset:image'])}
        bindings={[]}
        candidates={[imageCandidate]}
        densityVariant="image"
        onActivateCandidate={vi.fn()}
        onChange={vi.fn()}
        placeholder="生成提示词"
        value="@road"
      />,
    );

    await waitFor(() => expect(screen.queryByRole('listbox', { name: '引用媒体' })).toBeNull());
    expect(editor.getAttribute('aria-expanded')).toBe('false');
    expect(editor.getAttribute('aria-controls')).toBeNull();
    expect(editor.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('keeps a valid mention delete control keyboard reachable', async () => {
    const onChange = vi.fn();
    renderEditor({ value: 'scene @图片1 ', bindings: [imageBinding], onChange });
    const removeButton = await screen.findByRole('button', { name: '删除引用 图片1' });
    removeButton.focus();
    fireEvent.keyDown(removeButton, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ value: 'scene ', bindings: [imageBinding] }));
  });
});
