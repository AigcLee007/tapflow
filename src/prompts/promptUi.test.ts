import { beforeEach, describe, expect, test, vi } from "vitest";

import { closePromptDetail, copyPromptText, getPromptText, openPromptDetail, preferredPromptLanguage } from "./promptUi";

describe("prompt detail history", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/prompts?q=poster&category=design");
  });

  test("marks details opened from the plaza and preserves filters", () => {
    openPromptDetail("/prompts/prompt-1?q=poster&category=design");

    expect(window.location.pathname).toBe("/prompts/prompt-1");
    expect(window.location.search).toBe("?q=poster&category=design");
    expect(window.history.state).toMatchObject({ promptModalFromPlaza: true });
  });

  test("uses browser Back only for a detail opened from the plaza", () => {
    window.history.replaceState({ promptModalFromPlaza: true }, "", "/prompts/prompt-1?q=poster");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);

    closePromptDetail("/prompts?q=poster");

    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  test("replaces a direct detail URL with the filtered plaza URL", () => {
    window.history.replaceState(null, "", "/prompts/prompt-1?q=poster");
    const popstate = vi.fn();
    window.addEventListener("popstate", popstate);

    closePromptDetail("/prompts?q=poster");

    expect(window.location.pathname).toBe("/prompts");
    expect(window.location.search).toBe("?q=poster");
    expect(popstate).toHaveBeenCalledTimes(1);
    window.removeEventListener("popstate", popstate);
  });

  test("selects and copies bilingual prompt text independently", async () => {
    const prompt = { promptText: "English", promptTextEn: "English", promptTextZh: "中文" } as never;
    expect(preferredPromptLanguage(prompt, "zh-CN")).toBe("zh");
    expect(getPromptText(prompt, "en")).toBe("English");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await copyPromptText(prompt, "both");
    expect(writeText).toHaveBeenCalledWith("中文：\n中文\n\nEnglish:\nEnglish");
  });
});
