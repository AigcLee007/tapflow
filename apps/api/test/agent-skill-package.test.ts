import { describe, expect, it } from "vitest";
import { validateSkillPackage } from "../src/modules/agent/skill-package.service.js";

describe("Skill package validation", () => {
  it("accepts only the creator package files", () => {
    expect(validateSkillPackage({ skillMd: "# Skill", files: [{ path: "references/brief.txt", content: "brief" }] })).toMatchObject({ skillMd: "# Skill" });
  });
  it("rejects traversal, executable files, and URL or base64 payloads", () => {
    expect(() => validateSkillPackage({ skillMd: "# Skill", files: [{ path: "../run.sh", content: "x" }] })).toThrow("SKILL_INVALID_PACKAGE_PATH");
    expect(() => validateSkillPackage({ skillMd: "# Skill", files: [{ path: "assets/run.exe", content: "x" }] })).toThrow("SKILL_INVALID_PACKAGE_FILE");
    expect(() => validateSkillPackage({ skillMd: "# Skill", files: [{ path: "references/url.txt", content: "https://example.com" }] })).toThrow("SKILL_INVALID_PACKAGE_CONTENT");
  });
  it("requires embedded manifest files to match the package projection", () => {
    expect(() => validateSkillPackage({ skillMd: "# Skill", files: [{ path: "SKILL.md", content: "# Different" }] })).toThrow("SKILL_INVALID_PACKAGE_CONTENT");
    expect(() => validateSkillPackage({ skillMd: "# Skill", graphJson: { schemaVersion: "v2" }, files: [{ path: "graph.json", content: "{\"schemaVersion\":\"v1\"}" }] })).toThrow("SKILL_INVALID_PACKAGE_CONTENT");
    expect(validateSkillPackage({ skillMd: "# Skill", graphJson: { schemaVersion: "v2" }, files: [{ path: "SKILL.md", content: "# Skill" }, { path: "graph.json", content: "{\"schemaVersion\":\"v2\"}" }] })).toMatchObject({ skillMd: "# Skill" });
  });
});
