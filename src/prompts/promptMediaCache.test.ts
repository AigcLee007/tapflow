import { afterEach, describe, expect, test, vi } from "vitest";

import { getPromptMediaBlob } from "../services/v2PromptsApi";
import { clearPromptMediaCache, getPromptMediaObjectUrl } from "./promptMediaCache";

vi.mock("../services/v2PromptsApi", () => ({ getPromptMediaBlob: vi.fn() }));

describe("promptMediaCache", () => {
  afterEach(() => { clearPromptMediaCache(); vi.restoreAllMocks(); });

  test("deduplicates the same media variant request", async () => {
    vi.mocked(getPromptMediaBlob).mockResolvedValue(new Blob(["image"]));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:shared");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const [first, second] = await Promise.all([
      getPromptMediaObjectUrl("media-1", "thumb"),
      getPromptMediaObjectUrl("media-1", "thumb"),
    ]);
    expect(first).toBe("blob:shared"); expect(second).toBe("blob:shared");
    expect(getPromptMediaBlob).toHaveBeenCalledTimes(1);
  });

  test("limits media fetches to four concurrent requests", async () => {
    let active = 0; let maximum = 0;
    vi.mocked(getPromptMediaBlob).mockImplementation(async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return new Blob(["image"]); });
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${Math.random()}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    await Promise.all(Array.from({ length: 8 }, (_, index) => getPromptMediaObjectUrl(`media-${index}`, "thumb")));
    expect(maximum).toBe(4);
  });
});
