import { Bone, Euler, Group } from "three";
import { describe, expect, it } from "vitest";

import { applyUE4RestPoseAndRig, captureUE4RestPose } from "./ue4MannequinPoseApplication";

describe("ue4MannequinPoseApplication", () => {
  it("applies pose controls to mannequin bones whose GLB names contain spaces", () => {
    const scene = new Group();
    const pelvis = new Bone();
    pelvis.name = "Bip001 Pelvis_03";
    pelvis.position.set(0, 0, 0);

    const shoulder = new Bone();
    shoulder.name = "Bip001 L UpperArm_08";

    scene.add(pelvis);
    scene.add(shoulder);

    const restPose = captureUE4RestPose(scene);

    applyUE4RestPoseAndRig(scene, {
      controls: {
        "body.offsetY": -0.43,
        "leftShoulder.pitch": 15,
        "leftShoulder.spread": -70,
      },
      restPose,
    });

    const shoulderEuler = new Euler().setFromQuaternion(shoulder.quaternion);

    expect(Math.abs(shoulderEuler.y)).toBeGreaterThan(0.1);
    expect(pelvis.position.z).toBeLessThan(-1);
  });
});
