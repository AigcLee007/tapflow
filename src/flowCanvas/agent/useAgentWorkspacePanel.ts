import React from "react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";

export function useAgentWorkspacePanel() {
  const [activeTab, setActiveTab] = React.useState<AgentWorkspaceTab>("chat");
  const [width, setWidthState] = React.useState(420);

  const setWidth = React.useCallback((nextWidth: number) => {
    setWidthState(Math.min(720, Math.max(320, nextWidth)));
  }, []);

  return {
    activeTab,
    setActiveTab,
    setWidth,
    width,
  };
}
