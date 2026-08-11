import { describe, expect, test } from "vitest";

import { getFilmPlaybackPolicy } from "./filmPlaybackPolicy";

describe("film playback policy", () => {
  test("renders posters only when motion should be reduced", () => {
    expect(getFilmPlaybackPolicy({ reducedMotion: true, lowEndDevice: false, saveData: false })).toMatchObject({
      autoplay: false,
      renderVideo: false,
      transitionMs: 0,
    });
  });

  test("disables video on data saver and low-end devices", () => {
    expect(getFilmPlaybackPolicy({ reducedMotion: false, lowEndDevice: false, saveData: true }).renderVideo).toBe(false);
    expect(getFilmPlaybackPolicy({ reducedMotion: false, lowEndDevice: true, saveData: false }).renderVideo).toBe(false);
  });

  test("assigns active and adjacent preload priorities", () => {
    expect(getFilmPlaybackPolicy({ reducedMotion: false, lowEndDevice: false, saveData: false }, "active").preload).toBe("auto");
    expect(getFilmPlaybackPolicy({ reducedMotion: false, lowEndDevice: false, saveData: false }, "adjacent").preload).toBe("metadata");
    expect(getFilmPlaybackPolicy({ reducedMotion: false, lowEndDevice: false, saveData: false }, "distant").preload).toBe("none");
  });
});
