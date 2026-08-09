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
  type LexicalNode,
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

export type ActivatedMediaMention = { inputKey: string; kind: FlowMediaMentionKind; label?: string; previewUrl?: string };

export type MediaMentionPromptEditorProps = {
  ariaLabel?: string;
  activeInputKeys: ReadonlySet<string>;
  bindings: FlowMediaMentionBinding[];
  candidates: MediaMentionCandidate[];
  previewUrlsByInputKey?: Readonly<Record<string, string | undefined>>;
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

type ParsedPart = { text?: string; mention?: { binding?: FlowMediaMentionBinding; kind: FlowMediaMentionKind; label: string; valid: boolean; previewUrl?: string } };
type MentionQuerySnapshot = { endOffset: number; nodeKey: NodeKey; query: string; startOffset: number; version: number };
type EditorActions = { activate: (candidate: MediaMentionCandidate) => void; focus: () => void };
type PendingMentionCaret = { inputKey: string; expectedValue: string };

const mediaKindIcon: Record<FlowMediaMentionKind, typeof Image> = { image: Image, video: Video, audio: Music2 };
const EMPTY_PREVIEW_URLS: Readonly<Record<string, string | undefined>> = {};

function MentionPill({ disabled, label, kind, nodeKey, previewUrl, valid }: { disabled: boolean; label: string; kind: FlowMediaMentionKind; nodeKey: NodeKey; previewUrl?: string; valid: boolean }) {
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
    {previewUrl ? <img alt={label} src={previewUrl} style={{ width: 16, height: 16, objectFit: 'cover', borderRadius: 4 }} /> : <Icon aria-hidden size={15} />}
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
  __previewUrl?: string;

  static getType() { return 'media-mention'; }
  static clone(node: MediaMentionNode) { return new MediaMentionNode(node.__inputKey, node.__kind, node.__label, node.__valid, node.__key, node.__disabled, node.__previewUrl); }
  static importJSON(serialized: SerializedMediaMentionNode) { return new MediaMentionNode(serialized.inputKey, serialized.kind, serialized.label, serialized.valid); }

  constructor(inputKey: string | undefined, kind: FlowMediaMentionKind, label: string, valid: boolean, key?: NodeKey, disabled = false, previewUrl?: string) {
    super(key); this.__inputKey = inputKey; this.__kind = kind; this.__label = label; this.__valid = valid; this.__disabled = disabled; this.__previewUrl = previewUrl;
  }

  createDOM(_config: EditorConfig) { const element = document.createElement('span'); element.style.display = 'inline-flex'; element.style.verticalAlign = 'baseline'; return element; }
  updateDOM() { return false; }
  isInline(): true { return true; }
  getTextContent() { return `@${this.__label}`; }
  exportJSON(): SerializedMediaMentionNode { return { type: 'media-mention', version: 1, inputKey: this.__inputKey, kind: this.__kind, label: this.__label, valid: this.__valid }; }
  setValidity(valid: boolean) { const self = this.getWritable(); self.__valid = valid; }
  setPreviewUrl(previewUrl?: string) { const self = this.getWritable(); self.__previewUrl = previewUrl; }
  setDisabled(disabled: boolean) { const self = this.getWritable(); self.__disabled = disabled; }
  decorate() { return <MentionPill disabled={this.__disabled} kind={this.__kind} label={this.__label} nodeKey={this.__key} previewUrl={this.__previewUrl} valid={this.__valid} />; }
}

function $createMediaMentionNode(part: NonNullable<ParsedPart['mention']>) {
  return new MediaMentionNode(part.binding?.inputKey, part.kind, part.label, part.valid, undefined, false, part.previewUrl);
}

function parseMediaMentions(value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>, previewUrlsByInputKey: Readonly<Record<string, string | undefined>>, runtimePreviewUrls: Readonly<Record<string, string | undefined>>): ParsedPart[] {
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
      previewUrl: binding ? previewUrlsByInputKey[binding.inputKey] || runtimePreviewUrls[binding.inputKey] : undefined,
    } });
    cursor = start + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });
  return parts;
}

function initializePrompt(editor: LexicalEditor, value: string, bindings: FlowMediaMentionBinding[], activeInputKeys: ReadonlySet<string>, previewUrlsByInputKey: Readonly<Record<string, string | undefined>> = EMPTY_PREVIEW_URLS, runtimePreviewUrls: Readonly<Record<string, string | undefined>> = EMPTY_PREVIEW_URLS, restoreInputKey?: string) {
  let restored = false;
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    for (const line of String(value ?? '').split('\n')) {
      const paragraph = $createParagraphNode();
      for (const part of parseMediaMentions(line, bindings, activeInputKeys, previewUrlsByInputKey, runtimePreviewUrls)) {
        if (part.mention) paragraph.append($createMediaMentionNode(part.mention));
        else if (part.text) paragraph.append($createTextNode(part.text));
      }
      root.append(paragraph);
    }
    if (restoreInputKey) {
      const mention = $nodesOfType(MediaMentionNode).find((node) => node.__inputKey === restoreInputKey);
      const spacer = mention?.getNextSibling();
      if (spacer && $isTextNode(spacer)) {
        spacer.selectEnd();
        restored = true;
      }
    }
  });
  return restored;
}

function restoreCaretAfterMention(editor: LexicalEditor, inputKey: string) {
  let restored = false;
  editor.update(() => {
    const mention = $nodesOfType(MediaMentionNode).find((node) => node.__inputKey === inputKey);
    const spacer = mention?.getNextSibling();
    if (spacer && $isTextNode(spacer)) {
      spacer.selectEnd();
      restored = true;
    }
  }, { discrete: true });
  return restored;
}

function scheduleCaretRestore(editor: LexicalEditor, pendingCaretRef: React.MutableRefObject<PendingMentionCaret | null>, expected: PendingMentionCaret) {
  const restore = () => {
    const pending = pendingCaretRef.current;
    if (pending !== expected) return;
    let currentValue = '';
    editor.getEditorState().read(() => { currentValue = serializeEditor(); });
    if (currentValue !== expected.expectedValue) return;
    try {
      editor.focus();
      restoreCaretAfterMention(editor, expected.inputKey);
    } catch {
      // The editor may have unmounted before the deferred DOM selection commit.
    }
  };
  queueMicrotask(restore);
  setTimeout(restore, 0);
}

function serializeEditor(): string { return $getRoot().getChildren().map((child) => child.getTextContent()).join('\n'); }

function $getMentionQuery(version: number): MentionQuerySnapshot | null {
  const selection = $getSelection();
  if (!selection || !selection.isCollapsed()) return $getTrailingMentionQuery(version);
  const anchor = (selection as { anchor: { key: NodeKey; offset: number; type: string } }).anchor;
  let node = $getNodeByKey(anchor.key);
  let offset = anchor.offset;
  if (!$isRangeSelection(selection) && anchor.type === 'element' && $isElementNode(node)) {
    const rootChildren = node.getChildren();
    let child: LexicalNode | null = rootChildren[Math.max(0, anchor.offset > 0 ? anchor.offset - 1 : rootChildren.length - 1)] ?? null;
    while (child && $isElementNode(child)) {
      const children = child.getChildren();
      child = children[children.length - 1] ?? null;
    }
    if ($isTextNode(child)) { node = child; offset = child.getTextContentSize(); }
  }
  if (!$isTextNode(node) || (anchor.type !== 'text' && anchor.type !== 'element')) return $getTrailingMentionQuery(version);
  const prefix = node.getTextContent().slice(0, offset);
  const match = prefix.match(/@([^\s@/]*)$/);
  if (!match) return null;
  return { nodeKey: node.getKey(), startOffset: offset - match[0].length, endOffset: offset, query: match[1], version };
}

function $getTrailingMentionQuery(version: number): MentionQuerySnapshot | null {
  let current: LexicalNode | null = $getRoot();
  while (current && $isElementNode(current)) {
    const children = current.getChildren();
    current = children[children.length - 1] ?? null;
  }
  if (!$isTextNode(current)) return null;
  const text = current.getTextContent();
  const match = text.match(/@([^\s@/]*)$/);
  return match
    ? { nodeKey: current.getKey(), startOffset: text.length - match[0].length, endOffset: text.length, query: match[1], version }
    : null;
}

function EditorBridge({ activeInputKeys, ariaLabel = '生成提示词', bindings, candidates, disabled = false, onActivateCandidate, onChange, onEditorReady, placeholder, previewUrlsByInputKey = EMPTY_PREVIEW_URLS, value, setMenu, setMentionAnchor, registerActions, selectedIndex, moveSelection, contentStyle, editorElementRef, menuId, menuOpen, onActivationError }: MediaMentionPromptEditorProps & {
  contentStyle: React.CSSProperties;
  editorElementRef: React.MutableRefObject<HTMLElement | null>;
  menuId: string;
  menuOpen: boolean;
  moveSelection: (delta: number, count: number) => void;
  onActivationError: (message: string | null) => void;
  registerActions: (actions: EditorActions) => void;
  selectedIndex: number;
  setMenu: (menu: { query: string } | null) => void;
  setMentionAnchor: (query: MentionQuerySnapshot | null) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const bindingsRef = useRef(bindings);
  const activeKeysRef = useRef(activeInputKeys);
  const runtimePreviewUrlsRef = useRef<Record<string, string | undefined>>({});
  const pendingCaretRef = useRef<PendingMentionCaret | null>(null);
  const previewSignature = Object.entries(previewUrlsByInputKey).sort(([a], [b]) => a.localeCompare(b)).map(([key, url]) => `${key}:${url ?? ''}`).join('|');
  const composingRef = useRef(false);
  const queryRef = useRef<MentionQuerySnapshot | null>(null);
  const versionRef = useRef(0);
  const lastPropValueRef = useRef(value);
  const pendingLocalValueRef = useRef<string | null>(null);
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
    setMentionAnchor(null);
    setMenu(null);
    onActivationError(null);
  }, [disabled, onActivationError, setMenu, setMentionAnchor]);
  useEffect(() => {
    const query = queryRef.current;
    if (!query || filterCandidates(candidates, query.query).length) return;
    queryRef.current = null;
    setMentionAnchor(null);
    setMenu(null);
  }, [candidates, setMenu, setMentionAnchor]);
  useEffect(() => {
    bindingsRef.current = bindings;
    activeKeysRef.current = activeInputKeys;
    const nextBindingState = `${bindingSignature(bindings)}\u0000${[...activeInputKeys].sort().join('|')}\u0000${previewSignature}`;
    let currentValue = '';
    editor.getEditorState().read(() => { currentValue = serializeEditor(); });
    const propValueChanged = value !== lastPropValueRef.current;
    lastPropValueRef.current = value;
    const awaitingLocalValueEcho = !propValueChanged
      && currentValue !== value
      && pendingLocalValueRef.current === currentValue;
    if (currentValue !== value && !awaitingLocalValueEcho) {
      lastSerializedValueRef.current = value;
      pendingLocalValueRef.current = null;
      bindingStateRef.current = nextBindingState;
      const pending = pendingCaretRef.current;
      const restored = currentValue !== value && initializePrompt(
        editor,
        value,
        bindings,
        activeInputKeys,
        previewUrlsByInputKey,
        runtimePreviewUrlsRef.current,
        pending?.expectedValue === value ? pending.inputKey : undefined,
      );
      if (pending && (pending.expectedValue !== value || restored)) pendingCaretRef.current = null;
      return;
    }
    if (currentValue === value && pendingLocalValueRef.current === value) pendingLocalValueRef.current = null;
    lastSerializedValueRef.current = currentValue;
    if (nextBindingState === bindingStateRef.current) return;
    bindingStateRef.current = nextBindingState;
    const multiplicity = new Map<string, number>();
    for (const binding of bindings) multiplicity.set(binding.label, (multiplicity.get(binding.label) ?? 0) + 1);
    editor.update(() => {
      for (const node of $nodesOfType(MediaMentionNode)) {
        const matching = node.__inputKey ? bindings.find((binding) => binding.inputKey === node.__inputKey) : undefined;
        node.setValidity(Boolean(matching && multiplicity.get(matching.label) === 1 && activeInputKeys.has(matching.inputKey)));
        node.setDisabled(disabled);
        const previewUrl = node.__inputKey ? previewUrlsByInputKey[node.__inputKey] || runtimePreviewUrlsRef.current[node.__inputKey] : undefined;
        if (previewUrl) {
          node.setPreviewUrl(previewUrl);
          if (node.__inputKey) runtimePreviewUrlsRef.current[node.__inputKey] = previewUrl;
        }
      }
    }, { discrete: true });
    const pending = pendingCaretRef.current;
    if (pending && pending.expectedValue === lastSerializedValueRef.current && initializePrompt(editor, value, bindings, activeInputKeys, previewUrlsByInputKey, runtimePreviewUrlsRef.current, pending.inputKey)) {
      pendingCaretRef.current = null;
    }
  }, [activeInputKeys, bindings, disabled, editor, previewSignature, value]);

  useEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending || pending.expectedValue !== value) return;
    scheduleCaretRestore(editor, pendingCaretRef, pending);
    setTimeout(() => {
      if (pendingCaretRef.current === pending) pendingCaretRef.current = null;
    }, 0);
  }, [bindings, editor, value]);

  const activate = useCallback(async (candidate: MediaMentionCandidate) => {
    const snapshot = queryRef.current;
    if (disabled || composingRef.current || !snapshot || candidate.disabledReason) return;
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
      if ($isRangeSelection(selection) && !selection.isCollapsed()) return;
      const savedNode = $getNodeByKey(snapshot.nodeKey);
      const savedValid = $isTextNode(savedNode)
        && savedNode.getTextContent().slice(snapshot.startOffset, snapshot.endOffset) === `@${snapshot.query}`
        && (!$isRangeSelection(selection) || (selection.anchor.key === snapshot.nodeKey && selection.anchor.offset === snapshot.endOffset));
      const target = savedValid ? snapshot : $getTrailingMentionQuery(snapshot.version);
      if (!target) return;
      const node = $getNodeByKey(target.nodeKey);
      if (!$isTextNode(node) || node.getTextContent().slice(target.startOffset, target.endOffset) !== `@${target.query}`) return;
      const allocation = allocateMediaMentionBinding({ bindings: bindingsRef.current, input: activated, label: activated.label });
      bindingsRef.current = allocation.bindings;
      const sourceText = node.getTextContent();
      const before = sourceText.slice(0, target.startOffset);
      const after = sourceText.slice(target.endOffset);
      const previewUrl = activated.previewUrl || candidate.thumbnailUrl || previewUrlsByInputKey[allocation.binding.inputKey] || runtimePreviewUrlsRef.current[allocation.binding.inputKey];
      if (previewUrl) runtimePreviewUrlsRef.current[allocation.binding.inputKey] = previewUrl;
      const mention = new MediaMentionNode(allocation.binding.inputKey, allocation.binding.kind, allocation.binding.label, true, undefined, false, previewUrl);
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
      pendingCaretRef.current = { inputKey: allocation.binding.inputKey, expectedValue: serializeEditor() };
      inserted = true;
    }, { discrete: true });
    if (inserted) {
      queryRef.current = null;
      setMentionAnchor(null);
      setMenu(null);
      onActivationError(null);
      const pending = pendingCaretRef.current;
      if (pending) scheduleCaretRestore(editor, pendingCaretRef, pending);
    }
  }, [disabled, editor, onActivateCandidate, onActivationError, previewUrlsByInputKey, setMenu, setMentionAnchor]);

  const onEditorChange = useCallback((editorState: Parameters<React.ComponentProps<typeof OnChangePlugin>['onChange']>[0]) => {
    editorState.read(() => {
      versionRef.current += 1;
      const nextValue = serializeEditor();
      lastSerializedValueRef.current = nextValue;
      pendingLocalValueRef.current = nextValue;
      const query = composingRef.current ? null : $getMentionQuery(versionRef.current);
      queryRef.current = query;
      setMentionAnchor(query);
      setMenu(query && filterCandidates(candidates, query.query).length ? { query: query.query } : null);
      if (nextValue !== value || bindingSignature(bindingsRef.current) !== bindingSignature(bindings)) {
        onChange({ value: nextValue, bindings: bindingsRef.current });
      }
    });
  }, [bindings, candidates, onChange, setMenu, setMentionAnchor, value]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (event.key === '@' && !disabled && !composingRef.current) {
      const sync = () => editor.getEditorState().read(() => {
        versionRef.current += 1;
        const query = $getMentionQuery(versionRef.current);
        queryRef.current = query;
        setMentionAnchor(query);
        setMenu(query && filterCandidates(candidates, query.query).length ? { query: query.query } : null);
      });
      queueMicrotask(sync);
      setTimeout(sync, 0);
    }
    const snapshot = queryRef.current;
    const filtered = snapshot ? filterCandidates(candidates, snapshot.query) : [];
    if (disabled || composingRef.current || !filtered.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(event.key === 'ArrowDown' ? 1 : -1, filtered.length); return; }
    if (event.key === 'Escape') { event.preventDefault(); queryRef.current = null; setMentionAnchor(null); setMenu(null); return; }
    if (event.key === 'Enter') event.preventDefault();
  }, [activate, candidates, disabled, editor, moveSelection, selectedIndex, setMenu, setMentionAnchor]);

  useEffect(() => editor.registerCommand(KEY_ENTER_COMMAND, (event: KeyboardEvent | null) => {
    const snapshot = queryRef.current;
    const filtered = snapshot ? filterCandidates(candidates, snapshot.query) : [];
    if (disabled || composingRef.current || !filtered.length) return false;
    event?.preventDefault();
    void activate(filtered[Math.min(selectedIndex, filtered.length - 1)]);
    return true;
  }, COMMAND_PRIORITY_HIGH), [activate, candidates, disabled, editor, selectedIndex]);

  const onInput = useCallback(() => {
    if (disabled || composingRef.current) return;
    queueMicrotask(() => {
      editor.getEditorState().read(() => {
        versionRef.current += 1;
        const query = $getMentionQuery(versionRef.current);
        queryRef.current = query;
        setMentionAnchor(query);
        setMenu(query && filterCandidates(candidates, query.query).length ? { query: query.query } : null);
      });
    });
  }, [candidates, disabled, editor, setMenu, setMentionAnchor]);

  useEffect(() => { registerActions({ activate: (candidate) => { void activate(candidate); }, focus: () => editor.focus() }); }, [activate, editor, registerActions]);

  const snapshot = queryRef.current;
  const selectedCandidate = snapshot ? filterCandidates(candidates, snapshot.query)[selectedIndex] : undefined;

  return <>
    <PlainTextPlugin
      contentEditable={<ContentEditable aria-activedescendant={menuOpen && selectedCandidate ? getMediaMentionOptionId(menuId, selectedCandidate.candidateKey) : undefined} aria-autocomplete="list" aria-controls={menuOpen ? menuId : undefined} aria-expanded={menuOpen} aria-label={ariaLabel} className="nodrag nopan nowheel sleek-scroll-y flow-rich-prompt-editor" disabled={disabled} onBeforeInput={(event) => { if ((event.nativeEvent as InputEvent).data === '@') onInput(); }} onCompositionEnd={() => { composingRef.current = false; }} onCompositionStart={() => { composingRef.current = true; queryRef.current = null; setMenu(null); }} onInput={onInput} onKeyDown={onKeyDown} role="combobox" style={contentStyle} />}
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
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<MentionQuerySnapshot | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
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
  const measureAnchor = useCallback(() => {
    const editorElement = editorElementRef.current;
    const lexicalEditor = lexicalEditorRef.current;
    if (!editorElement || !lexicalEditor || !mentionAnchor) { setAnchorRect(null); return; }
    const domNode = lexicalEditor.getElementByKey(mentionAnchor.nodeKey);
    const textNode = domNode ? (document.createTreeWalker(domNode, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    const nextRect = getMentionCaretRect(editorElement, textNode ? { textNode, offset: mentionAnchor.endOffset } : undefined);
    setAnchorRect((previous) => sameAnchorRect(previous, nextRect) ? previous : nextRect);
  }, [mentionAnchor]);
  useEffect(() => { measureAnchor(); }, [measureAnchor, props.value]);
  useEffect(() => {
    if (!menu) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measureAnchor); };
    const observer = typeof ResizeObserver !== 'undefined' && editorElementRef.current ? new ResizeObserver(schedule) : null;
    const viewport = editorElementRef.current?.closest('.react-flow__viewport');
    let lastViewportStyle = viewport?.getAttribute('style') ?? '';
    const viewportObserver = typeof MutationObserver !== 'undefined' && viewport
      ? new MutationObserver(() => {
        const nextStyle = viewport.getAttribute('style') ?? '';
        if (nextStyle === lastViewportStyle) return;
        lastViewportStyle = nextStyle;
        schedule();
      })
      : null;
    if (editorElementRef.current) observer?.observe(editorElementRef.current);
    viewportObserver?.observe(viewport, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); viewportObserver?.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [menu, measureAnchor]);

  return <LexicalComposer initialConfig={initialConfig}>
    <div style={{ position: 'relative', minHeight: density.editorMinHeight, maxHeight: density.editorMaxHeight }}>
      <EditorBridge {...props} contentStyle={contentStyle} editorElementRef={editorElementRef} menuId={menuId} menuOpen={Boolean(menu)} moveSelection={moveSelection} onActivationError={setActivationError} onEditorReady={(editor) => { lexicalEditorRef.current = editor; props.onEditorReady?.(editor); }} registerActions={(actions) => { actionsRef.current = actions; }} selectedIndex={selectedIndex} setMenu={setMentionMenu} setMentionAnchor={setMentionAnchor} />
      {menu ? <MediaMentionCandidateMenu anchorRect={anchorRect} candidates={props.candidates} layerKey={`media-mention-candidates:${editorLayerId}`} menuId={menuId} onDismiss={() => { setMenu(null); setMentionAnchor(null); }} onSelect={(candidate) => actionsRef.current?.activate(candidate)} query={menu.query} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex} /> : null}
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

function sameAnchorRect(left: DOMRect | null, right: DOMRect | null): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.width === right.width
    && left.height === right.height;
}
