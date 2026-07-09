import { afterEach, describe, expect, it, vi } from "vitest";

import {
  postDirectorDeskCapturesToHost,
  setDirectorDeskCaptureHostHandler,
} from "./hostBridge";

describe("director desk host bridge", () => {
  afterEach(() => {
    setDirectorDeskCaptureHostHandler(null);
    vi.restoreAllMocks();
  });

  it("sends captures through the embedded host handler before falling back to postMessage", () => {
    const handler = vi.fn();
    const postMessageSpy = vi.spyOn(window, "postMessage");
    setDirectorDeskCaptureHostHandler(handler);

    postDirectorDeskCapturesToHost([
      { dataUrl: "data:image/png;base64,Y2FwdHVyZQ==", fileName: "camera-shot.png" },
    ]);

    expect(handler).toHaveBeenCalledWith([
      { dataUrl: "data:image/png;base64,Y2FwdHVyZQ==", fileName: "camera-shot.png" },
    ]);
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("keeps the postMessage fallback for standalone iframe-style hosts", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");

    postDirectorDeskCapturesToHost([
      { dataUrl: "data:image/png;base64,Y2FwdHVyZQ==", fileName: "camera-shot.png" },
    ]);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: "storyai:director-desk-captures-sent",
        payload: {
          captures: [
            { dataUrl: "data:image/png;base64,Y2FwdHVyZQ==", fileName: "camera-shot.png" },
          ],
        },
      },
      window.location.origin,
    );
  });
});
