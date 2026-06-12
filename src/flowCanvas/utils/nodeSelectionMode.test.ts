import { describe, expect, test } from 'vitest';

import { getNodeSelectionMode } from './nodeSelectionMode';

describe('getNodeSelectionMode', () => {
  test('shows single node controls only when exactly one selected node is the current node', () => {
    expect(getNodeSelectionMode({ nodeSelected: true, selectedNodeCount: 1 })).toEqual({
      isMultiSelecting: false,
      showSingleNodeControls: true,
    });

    expect(getNodeSelectionMode({ nodeSelected: false, selectedNodeCount: 1 })).toEqual({
      isMultiSelecting: false,
      showSingleNodeControls: false,
    });
  });

  test('suppresses single node controls during multi selection', () => {
    expect(getNodeSelectionMode({ nodeSelected: true, selectedNodeCount: 2 })).toEqual({
      isMultiSelecting: true,
      showSingleNodeControls: false,
    });

    expect(getNodeSelectionMode({ nodeSelected: true, selectedNodeCount: 8 })).toEqual({
      isMultiSelecting: true,
      showSingleNodeControls: false,
    });
  });
});
