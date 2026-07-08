import { describe, expect, it } from "vitest";

import {
  createDirectorDataFromStoryAiProject,
  createStoryAiProjectFromDirectorData,
} from "./storyAiDirectorAdapter";
import { createDefaultDirectorProject } from "./storyai/editor/store/directorStore";

describe("storyAiDirectorAdapter", () => {
  it("round-trips pose controls through director3d actor snapshots", () => {
    const project = createDefaultDirectorProject();
    const character = project.objects.find((item) => item.kind === "character");
    if (!character?.characterRig) {
      throw new Error("Expected default director project to include a character rig");
    }

    character.characterRig.posePresetId = "kneel-one";
    character.characterRig.controls = {
      "leftHip.pitch": 68,
      "rightKnee.bend": 80,
      "body.offsetY": -0.42,
    };

    const directorData = createDirectorDataFromStoryAiProject(project);

    expect(directorData.actors[0]?.poseControls).toMatchObject({
      "leftHip.pitch": 68,
      "rightKnee.bend": 80,
      "body.offsetY": -0.42,
    });

    const restoredProject = createStoryAiProjectFromDirectorData(directorData);
    const restoredCharacter = restoredProject.objects.find((item) => item.kind === "character");

    expect(restoredCharacter?.characterRig?.posePresetId).toBe("kneel-one");
    expect(restoredCharacter?.characterRig?.controls).toMatchObject({
      "leftHip.pitch": 68,
      "rightKnee.bend": 80,
      "body.offsetY": -0.42,
    });
  });
});
