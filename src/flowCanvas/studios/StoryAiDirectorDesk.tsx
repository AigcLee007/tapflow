import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import type { FlowDirector3dData, FlowNodeData } from '../types';
import {
  createDirectorDataFromStoryAiProject,
  createStoryAiProjectFromDirectorData,
} from './storyAiDirectorAdapter';
import { DirectorDeskShell } from './storyai/app/layout/DirectorDeskShell';
import { DirectorCanvas } from './storyai/editor/canvas/DirectorCanvas';
import { clearDirectorDeskHostBridge, initDirectorDeskHostBridge } from './storyai/editor/io/hostBridge';
import type { DirectorProject } from './storyai/editor/schema/directorProject';
import { useDirectorStore } from './storyai/editor/store/directorStore';
import './storyai/styles/scoped.css';

interface StoryAiDirectorDeskProps {
  data?: FlowDirector3dData;
  nodeId: string;
  onClose: () => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export const StoryAiDirectorDesk: React.FC<StoryAiDirectorDeskProps> = ({
  data,
  nodeId,
  onClose,
  onUpdateNodeData,
}) => {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const hydratingRef = useRef(false);
  const latestProjectJsonRef = useRef('');
  const lastNodeIdRef = useRef(nodeId);
  const selfEchoProjectJsonRef = useRef<string | null>(null);

  useEffect(() => {
    initDirectorDeskHostBridge();
    return () => clearDirectorDeskHostBridge();
  }, []);

  useEffect(() => {
    if (lastNodeIdRef.current !== nodeId) {
      lastNodeIdRef.current = nodeId;
      latestProjectJsonRef.current = '';
      selfEchoProjectJsonRef.current = null;
    }

    const project = createStoryAiProjectFromDirectorData(data);
    const projectJson = stringifyProject(project);

    if (projectJson === latestProjectJsonRef.current || projectJson === selfEchoProjectJsonRef.current) {
      return;
    }

    hydratingRef.current = true;
    latestProjectJsonRef.current = projectJson;
    selfEchoProjectJsonRef.current = null;
    useDirectorStore.getState().replaceProject(project);
    queueMicrotask(() => {
      hydratingRef.current = false;
    });
  }, [data, nodeId]);

  useEffect(() => {
    return useDirectorStore.subscribe((state) => {
      if (hydratingRef.current) return;
      const projectJson = stringifyProject(state.project);
      if (projectJson === latestProjectJsonRef.current) return;
      latestProjectJsonRef.current = projectJson;
      const directorData = createDirectorDataFromStoryAiProject(state.project);
      selfEchoProjectJsonRef.current = stringifyProject(createStoryAiProjectFromDirectorData(directorData));
      onUpdateNodeData?.(nodeId, { director3d: directorData });
    });
  }, [nodeId, onUpdateNodeData]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="storyai-director-desk dark"
      data-theme="dark"
      data-testid="storyai-director-desk"
    >
      <div className="app-shell">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="top-bar-title">3D导演台</h1>
          </div>
          <div className="top-bar-center">
            <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
              <button
                className={`mode-toggle-button ui-segmented-item ${
                  viewMode === 'director' ? 'ui-segmented-item-active' : ''
                }`}
                aria-pressed={viewMode === 'director'}
                type="button"
                onClick={() => setViewMode('director')}
              >
                导演视角
              </button>
              <button
                className={`mode-toggle-button ui-segmented-item ${
                  viewMode === 'camera' ? 'ui-segmented-item-active' : ''
                }`}
                aria-pressed={viewMode === 'camera'}
                type="button"
                onClick={() => setViewMode('camera')}
              >
                机位视角
              </button>
            </div>
          </div>
          <div className="top-bar-actions">
            <button
              className="top-bar-action-button"
              type="button"
              aria-label="关闭"
              title="关闭"
              onClick={onClose}
            >
              <X aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>
        <DirectorDeskShell>
          <DirectorCanvas />
        </DirectorDeskShell>
      </div>
    </div>
  );
};

function stringifyProject(project: DirectorProject) {
  return JSON.stringify(project);
}
