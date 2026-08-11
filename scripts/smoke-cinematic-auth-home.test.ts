import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  CINEMATIC_AUTH_HOME_OUTPUT_DIR,
  CINEMATIC_AUTH_HOME_VIEWPORTS,
  buildCinematicAuthHomeCheckCode,
} from "./smoke-cinematic-auth-home";

const read = (file: string) => readFileSync(file, "utf8");

describe("cinematic auth home deployment and smoke contract", () => {
  test("forwards the public landing media base URL into the frontend build", () => {
    const dockerfile = read("Dockerfile");
    const compose = read("docker-compose.staging.yml");
    const stagingTemplate = read("docs/STAGING_ENV_TEMPLATE.md");

    expect(dockerfile).toContain("ARG VITE_LANDING_MEDIA_BASE_URL=/landing-films/v1");
    expect(dockerfile).toContain("ENV VITE_LANDING_MEDIA_BASE_URL=$VITE_LANDING_MEDIA_BASE_URL");
    expect(compose).toContain("VITE_LANDING_MEDIA_BASE_URL: ${VITE_LANDING_MEDIA_BASE_URL}");
    expect(stagingTemplate).toContain("VITE_LANDING_MEDIA_BASE_URL = https://cdn.example.com/landing-films/v1");
    expect(stagingTemplate).not.toMatch(/VITE_LANDING_MEDIA_BASE_URL\s*=\s*(?:sk-|[A-Za-z0-9_]{24,})/);
  });

  test("defines the built-frontend cinematic acceptance checks and stable artifacts", () => {
    expect(CINEMATIC_AUTH_HOME_OUTPUT_DIR.replaceAll("\\", "/")).toBe("output/playwright/cinematic-auth-home");
    expect(CINEMATIC_AUTH_HOME_VIEWPORTS).toEqual([
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]);

    const code = buildCinematicAuthHomeCheckCode({
      outputDirectory: CINEMATIC_AUTH_HOME_OUTPUT_DIR,
      reducedMotion: false,
      viewport: CINEMATIC_AUTH_HOME_VIEWPORTS[0],
    });
    expect(code).toContain("document.elementsFromPoint");
    expect(code).toContain("chapterStates");
    expect(code).toContain("heading");
    expect(code).toContain("CTA");
    expect(code).toContain("smokePage.screenshot");
    expect(read("scripts/smoke-cinematic-auth-home.ts")).toContain("sharp(screenshotPath)");
    expect(code).toContain("currentTime");
    expect(code).toContain("preload");
    expect(code).toContain("Escape");
    expect(code).toContain("/register");
    expect(code).toContain("/forgot-password");
    expect(read("scripts/smoke-cinematic-auth-home.ts")).toContain("near-uniform or blank");
  });
});
