import { describe, expect, it } from "vitest";
import { modelDisplayName } from "./modelDisplayName";

describe("product model labels", () => {
  it("keeps text and image modalities distinct without exposing route details", () => {
    expect(modelDisplayName("text.gpt-5-5")).toBe("GPT-5.5");
    expect(modelDisplayName("gpt-image-2")).toBe("GPT Image 2");
    expect(modelDisplayName("provider.route.upstream")).toBe("默认模型");
  });
});
