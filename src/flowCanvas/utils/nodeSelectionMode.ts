export type NodeSelectionMode = {
  isMultiSelecting: boolean;
  showSingleNodeControls: boolean;
};

export function getNodeSelectionMode(input: {
  nodeSelected: boolean;
  selectedNodeCount: number;
}): NodeSelectionMode {
  const selectedNodeCount = Math.max(0, Math.floor(input.selectedNodeCount));
  return {
    isMultiSelecting: selectedNodeCount > 1,
    showSingleNodeControls: input.nodeSelected && selectedNodeCount === 1,
  };
}
