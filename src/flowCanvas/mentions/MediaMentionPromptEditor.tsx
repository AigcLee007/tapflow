import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  DecoratorNode,
  KEY_ENTER_COMMAND,
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
import { filterCandidates, getMediaMentionOptionId, MediaMentionCandidateMenu } from './MediaMentionCandidateMenu';
import type { MediaMentionCandidate } from './mediaMentionCandidates';
import { getMentionCaretRect } from './mentionCaret';

export type ActivatedMediaMention = { inputKey: string; kind: FlowMediaMentionKind };

export type MediaMentionPromptEditorProps = {
  ariaLabel?: string;
  activeInputKeys: ReadonlySet<string>;
  bindings: FlowMediaMentionBinding[];
  candidates: MediaMentionCandidate[];
  disabled?: boolean;
  densityVariant: 'image' | 'video';
  onActivateCandidate: (candidate: MediaMentionCandidate) => Promise<ActivatedMediaMention> | ActivatedMediaMention;
  onChange: (next: { bindings: FlowMediaMentionBinding[]; value: string }) => void;
  /** Test and integration escape hatch; no UI code needs to retain this editor. */
  onEditorReady?: (editor: LexicalEditor) => void;
  placeholder: string;
  value: string;
};

export type MediaMentionPromptEditorHandle = { focus: () => void };

type SerializedMediaMentionNode = Spread<{
  inputKey?: string;
  kind: FlowMediaMentionKind;
  label: string;
  valid: boolean;
}, SerializedLexicalNode>;

type ParsedPart = { text?: string; mention?: { binding?: FlowMediaMentionBinding; kind: FlowMediaMentionKind; label: string; valid: boolean } };
type MentionQuerySnapshot = { endOffset: number; nodeKey: NodeKey; query: string; startOffset: number; version: number };
type EditorActions = { activate: (candidate: MediaMentionCandidate) => void; focus: () => void };

const mediaKindIcon: Record<FlowMediaMentionKind, typeof Image> = { image: Image, video: Video, audio: Music2 };

function MentionPill({ disabled, label, kind, nodeKey, valid }: { disabled: boolean; label: string; kind: FlowMediaMentionKind; nodeKey: NodeKey; valid: boolean }) {
  const [editor] = useLexicalComposerContext();
  const Icon = valid ? mediaKindIcon[kind] : TriangleAlert;
  const remove = useCallback(() => {
    if (disabled) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      const nextSibling = node?.getNextSibling();
      if ($isTextNode(nextSibling) && /^\s/.test(nextSibling.getTextContent())) {
        nextSibling.setTextContent(nextSibling.getTextContent().slice(1));
      }
      node?.remove();
    }, { discrete: true });
  }, [disabled, editor, nodeKey]);

  return <span contentEditable={false} data-invalid={valid ? undefined : 'true'} style={pillStyle(valid)}>
    <Icon aria-hidden size={15} />
    <span>{`@${label}`}</span>
    {valid ? <button aria-label={`${'\u5220\u9664\u5f15\u7528'} ${label}`} disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); remove(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); remove(); } }} onMouseDown={(event) => event.preventDefault()} style={removeButtonStyle} type="button"><X size={11} /></button> : null}
  </span>;
}

class MediaMentionNode extends DecoratorNode<React.ReactNode> {
  __inputKey?: string;
  __kind: FlowMediaMentionKind;
  __label: string;
  __valid: boolean;
  __disabled: boolean;

  static getType() { return 'media-mention'; }
  static clone(node: MediaMentionNode) { return new MediaMentionNode(node.__inputKey, node.__kind, node.__label, node.__valid, node.__key, node.__disabled); }
  static importJSON(serialized: SerializedMediaMentionNode) { return new MediaMentionNode(serialized.inputKey, serialized.kind, serialized.label, serialized.valid); }

  constructor(inputKey: string | undefined, kind: FlowMediaMentionKind, label: string, valid: boolean, key?: NodeKey, disabled = false) {
    super(key); this.__inputKey = inputKey; this.__kind = kind; this.__label = label; this.__valid = valid; this.__disabled = disabled;
  }

  createDOM(_config: EditorConfig) { const element = document.createElement('span'); element.style.display = 'inline-flex'; element.style.verticalAlign = 'baseline'; return element; }
  updateDOM() { return false; }
  isInline(): true { return true; }
  getTextContent() { return `@${this.__label}`; }
  exportJSON(): SerializedMediaMentionNode { return { type: 'media-mention', version: 1, inputKey: this.__inputKey, kind: this.__kind, label: this.__label, valid: this.__valid }; }
  setValidity(valid: boolean) { const self = this.getWritable(); self.__valid = valid; }
  setDisabled(disabled: boolean) { const self = this.getWritable(); self.__disabled = disabled; }
  decorate() { return <MentionPill disabled={this.__disabled} kind={this.__kind} label={this.__label} nodeKey={this.__key} valid={this.__valid} />; }
}

function $createMediaMentionNode(part: NonNullable<ParsedPart['mention']>) {
  return new MediaMentionNode(part.binding?.inputKey, part.kind, part.label, part.valid);
}

function parseMediaMentions(value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>): ParsedPart[] {
  const bindingsByLabel = new Map<string, FlowMediaMentionBinding[]>();
  for (const binding of bindings) bindingsByLabel.set(binding.label, [...(bindingsByLabel.get(binding.label) ?? []), binding]);
  const labels = [...bindingsByLabel.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (!labels.length) return [{ text: value }];
  const pattern = new RegExp(`@(?:${labels.join('|')})(?=$|\\s|[,.!?;:，。！？；：\\])}'"”’])`, 'g');
  const parts: ParsedPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: value.slice(cursor, start) });
    const label = match[0].slice(1);
    const sameLabelBindings = bindingsByLabel.get(label) ?? [];
    const binding = sameLabelBindings.length === 1 ? sameLabelBindings[0] : undefined;
    parts.push({ mention: {
      binding,
      kind: binding?.kind ?? sameLabelBindings[0]?.kind ?? 'image',
      label,
      valid: Boolean(binding && resolveMediaMentionToken({ activeInputKeys, binding }).status === 'valid'),
    } });
    cursor = start + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });
  return parts;
}

function initializePrompt(editor: LexicalEditor, value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>) {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    for (const line of String(value ?? '').split('\n')) {
      const paragraph = $createParagraphNode();
      for (const part of parseMediaMentions(line, bindings, activeInputKeys)) {
        if (part.mention) paragraph.append($createMediaMentionNode(part.mention));
        else if (part.text) paragraph.append($createTextNode(part.text));
      }
      root.append(paragraph);
    }
  });
}

function serializeEditor(): string { return $getRoot().getChildren().map((child) => child.getTextContent()).join('\n'); }

function $getMentionQuery(version: number): MentionQuerySnapshot | null {
  const selection = $getSelection();
  if (!selection || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  let node = $getNodeByKey(anchor.key);
  let offset = anchor.offset;
  if (!$isRangeSelection(selection) && anchor.type === 'element' && $isElementNode(node)) {
    const child = node.getChildren()[Math.max(0, anchor.offset - 1)];
    if ($isTextNode(child)) {
      node = child;
      offset = child.getTextContentSize();
    }
  }
  if (!$isTextNode(node) || (anchor.type !== 'text' && anchor.type !== 'element')) return null;
  const prefix = node.getTextContent().slice(0, offset);
  const match = prefix.match(/@([^\s@/]*)$/);
  if (!match) return null;
  return { nodeKey: node.getKey(), startOffset: offset - match[0].length, endOffset: offset, query: match[1], version };
}

function EditorBridge({ activeInputKeys, ariaLabel = '生成提示词', bindings, candidates, disabled = false, onActivateCandidate, onChange, onEditorReady, placeholder, value, setMenu, registerActions, selectedIndex, moveSelection, contentStyle, editorElementRef, menuId, menuOpen, onActivationError }: MediaMentionPromptEditorProps & {
  contentStyle: React.CSSProperties;
  editorElementRef: React.MutableRefObject<HTMLElement | null>;
  menuId: string;
  menuOpen: boolean;
  moveSelection: (delta: number, count: number) => void;
  onActivationError: (message: string | null) => void;
  registerActions: (actions: EditorActions) => void;
  selectedIndex: number;
  setMenu: (menu: { query: string } | null) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const bindingsRef = useRef(bindings);
  const activeKeysRef = useRef(activeInputKeys);
  const composingRef = useRef(false);
  const queryRef = useRef<MentionQuerySnapshot | null>(null);
  const versionRef = useRef(0);
  const lastSerializedValueRef = useRef(value);
  const bindingStateRef = useRef(`${bindingSignature(bindings)}\u0000${[...activeInputKeys].sort().join('|')}`);

  useEffect(() => {
    editorElementRef.current = editor.getRootElement();
    onEditorReady?.(editor);
  }, [editor, editorElementRef, onEditorReady]);
  useEffect(() => {
    editor.setEditable(!disabled);
    editor.update(() => {
      for (const node of $nodesOfType(MediaMentionNode)) node.setDisabled(disabled);
    }, { discrete: true });
  }, [disabled, editor]);
  useEffect(() => {
    if (!disabled) return;
    queryRef.current = null;
    setMenu(null);
    onActivationError(null);
  }, [disabled, onActivationError, setMenu]);
  useEffect(() => {
    const query = queryRef.current;
    if (!query || filterCandidates(candidates, query.query).length) return;
    queryRef.current = null;
    setMenu(null);
  }, [candidates, setMenu]);
  useEffect(() => {
    bindingsRef.current = bindings;
    activeKeysRef.current = activeInputKeys;
    const nextBindingState = `${bindingSignature(bindings)}\u0000${[...activeInputKeys].sort().join('|')}`;
    if (value !== lastSerializedValueRef.current) {
      lastSerializedValueRef.current = value;
      bindingStateRef.current = nextBindingState;
      initializePrompt(editor, value, bindings, activeInputKeys);
      return;
    }
    if (nextBindingState === bindingStateRef.current) return;
    bindingStateRef.current = nextBindingState;
    const multiplicity = new Map<string, number>();
    for (const binding of bindings) multiplicity.set(binding.label, (multiplicity.get(binding.label) ?? 0) + 1);
    editor.update(() => {
      for (const node of $nodesOfType(MediaMentionNode)) {
        const matching = node.__inputKey ? bindings.find((binding) => binding.inputKey === node.__inputKey) : undefined;
        node.setValidity(Boolean(matching && multiplicity.get(matching.label) === 1 && activeInputKeys.has(matching.inputKey)));
        node.setDisabled(disabled);
      }
    }, { discrete: true });
  }, [activeInputKeys, bindings, disabled, editor, value]);

  const activate = useCallback(async (candidate: MediaMentionCandidate) => {
    const snapshot = queryRef.current;
    if (disabled || composingRef.current || !snapshot) return;
    let activated: ActivatedMediaMention;
    try {
      activated = await onActivateCandidate(candidate);
    } catch (error) {
      onActivationError(error instanceof Error ? error.message : 'Media mention is temporarily unavailable');
      return;
    }
    let inserted = false;
    editor.update(() => {
      if (versionRef.current !== snapshot.version) return;
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.key !== snapshot.nodeKey || selection.anchor.offset !== snapshot.endOffset) return;
      const node = $getNodeByKey(snapshot.nodeKey);
      if (!$isTextNode(node) || node.getTextContent().slice(snapshot.startOffset, snapshot.endOffset) !== `@${snapshot.query}`) return;
      const allocation = allocateMediaMentionBinding({ bindings: bindingsRef.current, input: activated });
      bindingsRef.current = allocation.bindings;
      const sourceText = node.getTextContent();
      const before = sourceText.slice(0, snapshot.startOffset);
      const after = sourceText.slice(snapshot.endOffset);
      const mention = $createMediaMentionNode({ binding: allocation.binding, kind: allocation.binding.kind, label: allocation.binding.label, valid: true });
      const spacer = $createTextNode(' ');
      if (before) {
        node.setTextContent(before);
        node.insertAfter(mention);
      } else {
        node.replace(mention);
      }
      mention.insertAfter(spacer);
      if (after) spacer.insertAfter($createTextNode(after));
      spacer.selectEnd();
      inserted = true;
    }, { discrete: true });
    if (inserted) {
      queryRef.current = null;
      setMenu(null);
      onActivationError(null);
      queueMicrotask(() => editor.focus());
    }
  }, [disabled, editor, onActivateCandidate, onActivationError, setMenu]);

  const onEditorChange = useCallback((editorState: Parameters<React.ComponentProps<typeof OnChangePlugin>['onChange']>[0]) => {
    editorState.read(() => {
      versionRef.current += 1;
      const nextValue = serializeEditor();
      lastSerializedValueRef.current = nextValue;
      const query = composingRef.current ? null : $getMentionQuery(versionRef.current);
      queryRef.current = query;
      setMenu(query && filterCandidates(candidates, query.query).length ? { query: query.query } : null);
      onChange({ value: nextValue, bindings: bindingsRef.current });
    });
  }, [candidates, onChange, setMenu]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    const snapshot = queryRef.current;
    const filtered = snapshot ? filterCandidates(candidates, snapshot.query) : [];
    if (disabled || composingRef.current || !filtered.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(event.key === 'ArrowDown' ? 1 : -1, filtered.length); return; }
    if (event.key === 'Escape') { event.preventDefault(); queryRef.current = null; setMenu(null); return; }
    if (event.key === 'Enter') event.preventDefault();
  }, [activate, candidates, disabled, moveSelection, selectedIndex, setMenu]);

  useEffect(() => editor.registerCommand(KEY_ENTER_COMMAND, (event: KeyboardEvent | null) => {
    const snapshot = queryRef.current;
    const filtered = snapshot ? filterCandidates(candidates, snapshot.query) : [];
    if (disabled || composingRef.current || !filtered.length) return false;
    event?.preventDefault();
    void activate(filtered[Math.min(selectedIndex, filtered.length - 1)]);
    return true;
  }, COMMAND_PRIORITY_HIGH), [activate, candidates, disabled, editor, selectedIndex]);

  useEffect(() => { registerActions({ activate: (candidate) => { void activate(candidate); }, focus: () => editor.focus() }); }, [activate, editor, registerActions]);

  const snapshot = queryRef.current;
  const selectedCandidate = snapshot ? filterCandidates(candidates, snapshot.query)[selectedIndex] : undefined;

  return <>
    <PlainTextPlugin
      contentEditable={<ContentEditable aria-activedescendant={menuOpen && selectedCandidate ? getMediaMentionOptionId(menuId, selectedCandidate.candidateKey) : undefined} aria-autocomplete="list" aria-controls={menuOpen ? menuId : undefined} aria-expanded={menuOpen} aria-label={ariaLabel} className="nodrag nopan nowheel sleek-scroll-y flow-rich-prompt-editor" disabled={disabled} onCompositionEnd={() => { composingRef.current = false; }} onCompositionStart={() => { composingRef.current = true; queryRef.current = null; setMenu(null); }} onKeyDown={onKeyDown} role="combobox" style={contentStyle} />}
      ErrorBoundary={LexicalErrorBoundary}
      placeholder={<div style={placeholderStyle}>{placeholder}</div>}
    />
    <OnChangePlugin ignoreHistoryMergeTagChange onChange={onEditorChange} />
  </>;
}

export const MediaMentionPromptEditor = forwardRef<MediaMentionPromptEditorHandle, MediaMentionPromptEditorProps>(function MediaMentionPromptEditor(props, ref) {
  const [menu, setMenu] = useState<{ query: string } | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const actionsRef = useRef<EditorActions | null>(null);
  const editorElementRef = useRef<HTMLElement | null>(null);
  const editorLayerId = useId();
  const menuId = useId();
  const density = getPromptBarDensity(props.densityVariant as PromptBarDensityVariant);
  const contentStyle = useMemo(() => ({ ...editorStyle, minHeight: density.editorMinHeight, maxHeight: density.editorMaxHeight, fontSize: density.editorFontSize, lineHeight: density.editorLineHeight }), [density]);
  const setMentionMenu = useCallback((nextMenu: { query: string } | null) => { setSelectedIndex(0); setMenu(nextMenu); }, []);
  const moveSelection = useCallback((delta: number, count: number) => setSelectedIndex((current) => (current + delta + count) % count), []);
  useImperativeHandle(ref, () => ({ focus: () => actionsRef.current?.focus() }), []);
  const initialConfig = useMemo(() => ({ namespace: 'MediaMentionPromptEditor', nodes: [MediaMentionNode], onError(error: Error) { throw error; }, editorState(editor: LexicalEditor) { initializePrompt(editor, props.value, props.bindings, props.activeInputKeys); }, theme: {} // initialization only; live typing is handled by Lexical itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return <LexicalComposer initialConfig={initialConfig}>
    <div style={{ position: 'relative', minHeight: density.editorMinHeight, maxHeight: density.editorMaxHeight }}>
      <EditorBridge {...props} contentStyle={contentStyle} editorElementRef={editorElementRef} menuId={menuId} menuOpen={Boolean(menu)} moveSelection={moveSelection} onActivationError={setActivationError} registerActions={(actions) => { actionsRef.current = actions; }} selectedIndex={selectedIndex} setMenu={setMentionMenu} />
      {menu ? <MediaMentionCandidateMenu anchorRect={getMentionCaretRect(editorElementRef.current) ?? editorElementRef.current?.getBoundingClientRect() ?? null} candidates={props.candidates} layerKey={`media-mention-candidates:${editorLayerId}`} menuId={menuId} onDismiss={() => setMenu(null)} onSelect={(candidate) => actionsRef.current?.activate(candidate)} query={menu.query} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} /> : null}
      {activationError ? <div aria-live="assertive" role="alert">{activationError}</div> : null}
    </div>
  </LexicalComposer>;
});

const removeButtonStyle: React.CSSProperties = { width: 14, height: 14, padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.35)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const editorStyle: React.CSSProperties = { width: '100%', overflowY: 'auto', background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontWeight: 400, fontFamily: '"Microsoft YaHei", Arial, sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word', caretColor: '#fff' };
const placeholderStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', color: 'rgba(255,255,255,0.28)', fontSize: 13, lineHeight: 1.5, fontFamily: '"Microsoft YaHei", Arial, sans-serif' };

function pillStyle(valid: boolean): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, margin: '0 2px', padding: '2px 5px 2px 4px', borderRadius: 6, border: `1px solid ${valid ? 'rgba(255,255,255,0.12)' : 'rgba(251,191,36,0.55)'}`, background: valid ? 'rgba(255,255,255,0.08)' : 'rgba(251,191,36,0.11)', color: valid ? '#f8fafc' : '#fde68a', fontSize: 13, fontWeight: 700, lineHeight: 1, verticalAlign: '-3px', userSelect: 'none' }; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function bindingSignature(bindings: FlowMediaMentionBinding[]) { return bindings.map((binding) => `${binding.inputKey}:${binding.kind}:${binding.label}`).join('|'); }
