import { describe, expect, it } from "vitest";

import { selectRightPanelKind } from "./directorSelectors";
import { createInitialDirectorState } from "./directorStore";

describe("director right panel routing", () => {
  it("shows the camera panel in camera view even when a character remains selected", () => {
    const state = createInitialDirectorState();
    const characterId = state.project.objects.find((item) => item.kind === "character")?.id;

    expect(characterId).toBeTruthy();
    expect(
      selectRightPanelKind({
        ...state,
        selectedObjectId: characterId ?? null,
        selectedObjectIds: characterId ? [characterId] : [],
        viewMode: "camera",
      })
    ).toBe("camera");
  });
});
