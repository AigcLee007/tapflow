import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { Image, Music2, TriangleAlert, Video, X } from 'lucide-react';
import type { FlowMediaMentionBinding, FlowMediaMentionKind } from '../types';
import { getPromptBarDensity, type PromptBarDensityVariant } from '../utils/promptBarDensity';
import { allocateMediaMentionBinding, resolveMediaMentionToken } from './mediaMentions';
import { filterCandidates, MediaMentionCandidateMenu } from './MediaMentionCandidateMenu';
import type { MediaMentionCandidate } from './mediaMentionCandidates';

export type ActivatedMediaMention = { inputKey: string; kind: FlowMediaMentionKind };

export type MediaMentionPromptEditorProps = {
  activeInputKeys: ReadonlySet<string>;
  bindings: FlowMediaMentionBinding[];
  candidates: MediaMentionCandidate[];
  disabled?: boolean;
  densityVariant: 'image' | 'video';
  onActivateCandidate: (candidate: MediaMentionCandidate) => Promise<ActivatedMediaMention> | ActivatedMediaMention;
  onChange: (next: { bindings: FlowMediaMentionBinding[]; value: string }) => void;
  placeholder: string;
  value: string;
};

export type MediaMentionPromptEditorHandle = { focus: () => void };

type SerializedMediaMentionNode = Spread<{
  inputKey: string;
  kind: FlowMediaMentionKind;
  label: string;
  valid: boolean;
}, SerializedLexicalNode>;

type ParsedMention = { binding: FlowMediaMentionBinding; valid: boolean };

const mediaKindIcon: Record<FlowMediaMentionKind, typeof Image> = { image: Image, video: Video, audio: Music2 };

function MentionPill({ label, kind, nodeKey, valid }: { label: string; kind: FlowMediaMentionKind; nodeKey: NodeKey; valid: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [hovered, setHovered] = useState(false);
  const Icon = valid ? mediaKindIcon[kind] : TriangleAlert;
  const remove = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      const nextSibling = node?.getNextSibling();
      if ($isTextNode(nextSibling)) {
        const nextText = nextSibling.getTextContent();
        if (/^\s/.test(nextText)) nextSibling.setTextContent(nextText.slice(1));
      }
      node?.remove();
    });
  }, [editor, nodeKey]);

  return (
    <span
      contentEditable={false}
      data-invalid={valid ? undefined : 'true'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, margin: '0 2px', padding: hovered && valid ? '2px 5px 2px 4px' : '2px 7px 2px 4px',
        borderRadius: 6, border: `1px solid ${valid ? 'rgba(255,255,255,0.12)' : 'rgba(251,191,36,0.55)'}`,
        background: valid ? 'rgba(255,255,255,0.08)' : 'rgba(251,191,36,0.11)', color: valid ? '#f8fafc' : '#fde68a',
        fontSize: 13, fontWeight: 700, lineHeight: 1, verticalAlign: '-3px', userSelect: 'none',
      }}
    >
      <Icon size={15} aria-hidden />
      <span>{`@${label}`}</span>
      {valid && hovered ? <button aria-label={`删除引用 ${label}`} onClick={remove} onMouseDown={(event) => event.preventDefault()} style={removeButtonStyle} tabIndex={-1} type="button"><X size={11} /></button> : null}
    </span>
  );
}

class MediaMentionNode extends DecoratorNode<React.ReactNode> {
  __inputKey: string;
  __kind: FlowMediaMentionKind;
  __label: string;
  __valid: boolean;

  static getType() { return 'media-mention'; }
  static clone(node: MediaMentionNode) { return new MediaMentionNode(node.__inputKey, node.__kind, node.__label, node.__valid, node.__key); }
  static importJSON(serialized: SerializedMediaMentionNode) { return new MediaMentionNode(serialized.inputKey, serialized.kind, serialized.label, serialized.valid); }

  constructor(inputKey: string, kind: FlowMediaMentionKind, label: string, valid: boolean, key?: NodeKey) {
    super(key); this.__inputKey = inputKey; this.__kind = kind; this.__label = label; this.__valid = valid;
  }

  createDOM(_config: EditorConfig) { const element = document.createElement('span'); element.style.display = 'inline-flex'; element.style.verticalAlign = 'baseline'; return element; }
  updateDOM() { return false; }
  isInline(): true { return true; }
  getTextContent() { return `@${this.__label}`; }
  exportJSON(): SerializedMediaMentionNode { return { type: 'media-mention', version: 1, inputKey: this.__inputKey, kind: this.__kind, label: this.__label, valid: this.__valid }; }
  decorate() { return <MentionPill inputKey={this.__inputKey} kind={this.__kind} label={this.__label} nodeKey={this.__key} valid={this.__valid} />; }
}

function $createMediaMentionNode(mention: ParsedMention) {
  return new MediaMentionNode(mention.binding.inputKey, mention.binding.kind, mention.binding.label, mention.valid);
}

function parseMentions(value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>) {
  const byLabel = new Map(bindings.map((binding) => [binding.label, binding]));
  const labels = [...byLabel.keys()].sort((left, right) => right.length - left.length).map(escapeRegExp);
  if (!labels.length) return [{ text: value }];
  const pattern = new RegExp(`@(?:${labels.join('|')})(?=$|\\s|[,.!?;:，。！？；：\\])}'"”’])`, 'g');
  const parts: Array<{ text?: string; mention?: ParsedMention }> = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: value.slice(cursor, start) });
    const binding = byLabel.get(match[0].slice(1));
    if (binding) parts.push({ mention: { binding, valid: resolveMediaMentionToken({ activeInputKeys, binding }).status === 'valid' } });
    cursor = start + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });
  return parts;
}

function writePrompt(editor: LexicalEditor, value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>) {
  editor.update(() => {
    const root = $getRoot(); root.clear();
    const lines = String(value ?? '').split('\n');
    for (const line of lines.length ? lines : ['']) {
      const paragraph = $createParagraphNode();
      for (const part of parseMentions(line, bindings, activeInputKeys)) {
        if (part.mention) paragraph.append($createMediaMentionNode(part.mention));
        else if (part.text) paragraph.append($createTextNode(part.text));
      }
      root.append(paragraph);
    }
  }, { discrete: true });
}

function serializeEditor(): string { return $getRoot().getChildren().map((child) => child.getTextContent()).join('\n'); }

function queryAtEnd(value: string): string | null {
  const match = value.match(/@([^\s@/]*)$/);
  return match ? match[1] : null;
}

type EditorActions = { activate: (candidate: MediaMentionCandidate) => void; focus: () => void };

function EditorBridge({ activeInputKeys, bindings, candidates, disabled = false, onActivateCandidate, onChange, placeholder, value, setMenu, registerActions, contentStyle, selectedIndex, moveSelection }: MediaMentionPromptEditorProps & {
  setMenu: (menu: { anchorRect: DOMRect | null; query: string } | null) => void;
  registerActions: (actions: EditorActions) => void;
  contentStyle: React.CSSProperties;
  selectedIndex: number;
  moveSelection: (delta: number, count: number) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const valueRef = useRef(value);
  const bindingsRef = useRef(bindings);
  const activeInputKeysRef = useRef(activeInputKeys);
  const composingRef = useRef(false);
  const rootElementRef = useRef<HTMLElement | null>(null);

  const writeValue = useCallback((nextValue: string, nextBindings = bindingsRef.current) => {
    valueRef.current = nextValue;
    writePrompt(editor, nextValue, nextBindings, activeInputKeysRef.current);
  }, [editor]);

  const bindingsSignature = bindings.map((binding) => `${binding.inputKey}:${binding.kind}:${binding.label}`).join('|');
  const activeSignature = [...activeInputKeys].sort().join('|');
  const previousExternalStateRef = useRef(`${value}\u0000${bindingsSignature}\u0000${activeSignature}`);
  useEffect(() => {
    const nextExternalState = `${value}\u0000${bindingsSignature}\u0000${activeSignature}`;
    bindingsRef.current = bindings; activeInputKeysRef.current = activeInputKeys;
    if (nextExternalState === previousExternalStateRef.current) return;
    previousExternalStateRef.current = nextExternalState;
    writeValue(value, bindings);
  }, [activeInputKeys, activeSignature, bindings, bindingsSignature, value, writeValue]);

  const syncQuery = useCallback((nextValue: string) => {
    if (composingRef.current) { setMenu(null); return; }
    const query = queryAtEnd(nextValue);
    if (query === null || !filterCandidates(candidates, query).length) { setMenu(null); return; }
    const rect = rootElementRef.current?.getBoundingClientRect() ?? null;
    setMenu({ anchorRect: rect, query });
  }, [candidates, setMenu]);

  useEffect(() => {
    syncQuery(valueRef.current);
  }, [syncQuery]);

  const activate = useCallback(async (candidate: MediaMentionCandidate) => {
    if (disabled || composingRef.current) return;
    const activated = await onActivateCandidate(candidate);
    const allocation = allocateMediaMentionBinding({ bindings: bindingsRef.current, input: activated });
    const currentValue = valueRef.current;
    const query = queryAtEnd(currentValue);
    if (query === null) return;
    const nextValue = `${currentValue.slice(0, -(query.length + 1))}@${allocation.binding.label} `;
    bindingsRef.current = allocation.bindings;
    previousExternalStateRef.current = `${nextValue}\u0000${bindingSignature(allocation.bindings)}\u0000${activeSignature}`;
    writeValue(nextValue, allocation.bindings);
    onChange({ value: nextValue, bindings: allocation.bindings });
    setMenu(null);
    queueMicrotask(() => editor.focus());
  }, [disabled, editor, onActivateCandidate, onChange, setMenu, writeValue]);

  const onContentInput = useCallback((event: React.FormEvent<HTMLElement>) => {
    if (disabled || composingRef.current) return;
    const domValue = event.currentTarget.innerText || event.currentTarget.textContent || '';
    const eventData = (event.nativeEvent as InputEvent).data;
    const nextValue = (domValue || (typeof eventData === 'string' ? `${valueRef.current}${eventData}` : '')).replace(/\r/g, '');
    if (nextValue === valueRef.current) return;
    writeValue(nextValue);
    previousExternalStateRef.current = `${nextValue}\u0000${bindingsSignature}\u0000${activeSignature}`;
    onChange({ value: nextValue, bindings: bindingsRef.current });
    syncQuery(nextValue);
  }, [disabled, onChange, syncQuery, writeValue]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const query = queryAtEnd(valueRef.current);
    const filtered = query === null ? [] : filterCandidates(candidates, query);
    if (disabled || composingRef.current || !filtered.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(event.key === 'ArrowDown' ? 1 : -1, filtered.length); return; }
    if (event.key === 'Escape') { event.preventDefault(); setMenu(null); return; }
    if (event.key === 'Enter') { event.preventDefault(); void activate(filtered[Math.min(selectedIndex, filtered.length - 1)]); }
  }, [activate, candidates, disabled, moveSelection, selectedIndex, setMenu]);

  useEffect(() => {
    registerActions({ activate: (candidate) => { void activate(candidate); }, focus: () => editor.focus() });
  }, [activate, editor, registerActions]);

  return (
    <>
      <PlainTextPlugin
        contentEditable={<ContentEditable
          aria-label="生成提示词"
          className="nodrag nopan nowheel sleek-scroll-y flow-rich-prompt-editor"
          disabled={disabled}
          onCompositionEnd={() => { composingRef.current = false; syncQuery(valueRef.current); }}
          onCompositionStart={() => { composingRef.current = true; setMenu(null); }}
          onInputCapture={onContentInput}
          onInput={onContentInput}
          onKeyDown={onKeyDown}
          ref={(element) => { rootElementRef.current = element; }}
          style={contentStyle}
        />}
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={<div style={placeholderStyle}>{placeholder}</div>}
      />
      <OnChangePlugin ignoreHistoryMergeTagChange onChange={(editorState) => {
        editorState.read(() => {
          const nextValue = serializeEditor();
          if (nextValue === valueRef.current) return;
          valueRef.current = nextValue;
          previousExternalStateRef.current = `${nextValue}\u0000${bindingsSignature}\u0000${activeSignature}`;
          onChange({ value: nextValue, bindings: bindingsRef.current });
          syncQuery(nextValue);
        });
      }} />
    </>
  );
}

export const MediaMentionPromptEditor = forwardRef<MediaMentionPromptEditorHandle, MediaMentionPromptEditorProps>(function MediaMentionPromptEditor(props, ref) {
  const [menu, setMenu] = useState<{ anchorRect: DOMRect | null; query: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const actionsRef = useRef<EditorActions | null>(null);
  const density = getPromptBarDensity(props.densityVariant as PromptBarDensityVariant);
  const contentStyle = useMemo(() => ({ ...editorStyle, minHeight: density.editorMinHeight, maxHeight: density.editorMaxHeight, fontSize: density.editorFontSize, lineHeight: density.editorLineHeight }), [density]);
  const handleSetMenu = useCallback((nextMenu: { anchorRect: DOMRect | null; query: string } | null) => {
    setSelectedIndex(0);
    setMenu(nextMenu);
  }, []);
  const moveSelection = useCallback((delta: number, count: number) => {
    setSelectedIndex((current) => (current + delta + count) % count);
  }, []);
  useImperativeHandle(ref, () => ({ focus: () => actionsRef.current?.focus() }), []);
  const initialConfig = useMemo(() => ({
    namespace: 'MediaMentionPromptEditor',
    nodes: [MediaMentionNode],
    onError(error: Error) { throw error; },
    editorState(editor: LexicalEditor) { writePrompt(editor, props.value, props.bindings, props.activeInputKeys); },
    theme: {},
  // A composer config is intentionally immutable after initialization; updates go
  // through EditorBridge to preserve selection and in-progress IME composition.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const filtered = menu ? filterCandidates(props.candidates, menu.query) : [];

  return <LexicalComposer initialConfig={initialConfig}>
    <div style={{ position: 'relative', minHeight: density.editorMinHeight, maxHeight: density.editorMaxHeight }}>
      <EditorBridge {...props} contentStyle={contentStyle} moveSelection={moveSelection} selectedIndex={selectedIndex} setMenu={handleSetMenu} registerActions={(actions) => { actionsRef.current = actions; }} />
      {menu ? <MediaMentionCandidateMenu anchorRect={menu.anchorRect} candidates={props.candidates} onDismiss={() => setMenu(null)} onSelect={(candidate) => {
        actionsRef.current?.activate(candidate);
      }} query={menu.query} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} /> : null}
    </div>
  </LexicalComposer>;
});

const removeButtonStyle: React.CSSProperties = { width: 14, height: 14, padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.35)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const editorStyle: React.CSSProperties = { width: '100%', overflowY: 'auto', background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontWeight: 400, fontFamily: '"Microsoft YaHei", Arial, sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word', caretColor: '#fff' };
const placeholderStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', color: 'rgba(255,255,255,0.28)', fontSize: 13, lineHeight: 1.5, fontFamily: '"Microsoft YaHei", Arial, sans-serif' };

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function bindingSignature(bindings: FlowMediaMentionBinding[]) { return bindings.map((binding) => `${binding.inputKey}:${binding.kind}:${binding.label}`).join('|'); }
