import { describe, expect, it, vi } from "vitest";
import { AGENT_REFERENCE_LIMIT } from "../../agentReferenceContext";
import { AppController } from "./AppController";
import { AttachmentController } from "./AttachmentController";
import { CanvasReferenceController } from "./CanvasReferenceController";
import { ModelController } from "./ModelController";
import { SkillController } from "./SkillController";

describe("Agent V6 capability controllers", () => {
  it("projects selected asset nodes into the V6 reference shape", () => {
    const controller = new CanvasReferenceController();

    expect(controller.projectSelectedNodes([
      { id: "node-1", selected: true, data: { assetId: "asset-1", title: "主视觉" } },
      { id: "node-2", selected: false, data: { assetId: "asset-2", title: "未选中" } },
    ])).toEqual([
      { nodeId: "node-1", assetId: "asset-1", refId: "canvas-node:node-1", label: "主视觉" },
    ]);
  });

  it("returns the stable asset id from an upload without a preview URL", async () => {
    const uploadAsset = vi.fn().mockResolvedValue({
      id: "asset-uploaded",
      kind: "image",
      originalFilename: "reference.png",
      previewUrl: "https://signed.example/preview",
      title: null,
    });
    const controller = new AttachmentController({ uploadAsset });

    await expect(controller.upload(new File(["image"], "reference.png", { type: "image/png" }))).resolves.toEqual({
      assetId: "asset-uploaded",
      kind: "image",
      label: "reference.png",
    });
    expect(uploadAsset).toHaveBeenCalledOnce();
  });

  it("keeps canvas reference uploads addressable by asset id", async () => {
    const controller = new CanvasReferenceController({
      uploadAsset: vi.fn().mockResolvedValue({
        id: "asset-reference",
        kind: "image",
        originalFilename: "reference.png",
        title: null,
      }),
    });

    await expect(controller.upload(new File(["image"], "reference.png", { type: "image/png" }))).resolves.toMatchObject({ assetId: "asset-reference" });
  });

  it("caps projected references at AGENT_REFERENCE_LIMIT", () => {
    const controller = new CanvasReferenceController();
    const refs = Array.from({ length: AGENT_REFERENCE_LIMIT + 2 }, (_, index) => ({
      assetId: `asset-${index}`,
      label: `Reference ${index}`,
      nodeId: `node-${index}`,
      refId: `ref-${index}`,
    }));

    expect(controller.limitReferences(refs)).toHaveLength(AGENT_REFERENCE_LIMIT);
  });

  it("deduplicates canvas references with the same refId before applying the limit", () => {
    const controller = new CanvasReferenceController();

    expect(controller.limitReferences([
      { assetId: "asset-first", label: "First", refId: "same-ref" },
      { assetId: "asset-duplicate", label: "Duplicate", refId: "same-ref" },
      { assetId: "asset-second", label: "Second", refId: "second-ref" },
    ])).toEqual([
      { assetId: "asset-first", label: "First", refId: "same-ref" },
      { assetId: "asset-second", label: "Second", refId: "second-ref" },
    ]);
  });

  it("projects skills to safe display metadata", async () => {
    const controller = new SkillController({
      listSkills: vi.fn().mockResolvedValue([{
        category: "image",
        id: "skill-1",
        inputHints: [
          { credential: "should-not-leak", kind: "asset", label: "参考图", required: true },
          { kind: "unsafe-custom-kind", label: "未知", required: true },
        ],
        modality: "image",
        name: "海报设计",
        provider: "should-not-leak",
        route: "should-not-leak",
        signedUrl: "https://signed.example/skill",
        summary: "生成海报",
        version: 2,
        visibility: "official",
      }]),
    });

    const result = await controller.list();
    expect(result).toEqual([{
      category: "image",
      id: "skill-1",
      inputHints: [{ kind: "asset", label: "参考图", required: true }],
      modality: "image",
      name: "海报设计",
      summary: "生成海报",
      version: 2,
      visibility: "official",
    }]);
    expect(JSON.stringify(result)).not.toMatch(/provider|route|credential|signedUrl/i);
  });

  it("drops skill items with invalid modality, visibility, or version", async () => {
    const validSkill = {
      id: "valid-skill",
      modality: "text",
      name: "有效 Skill",
      summary: "可展示",
      version: 0,
      visibility: "private",
    };
    const controller = new SkillController({
      listSkills: vi.fn().mockResolvedValue([
        validSkill,
        { ...validSkill, id: "unknown-modality", modality: "audio" },
        { ...validSkill, id: "internal-visibility", visibility: "internal" },
        { ...validSkill, id: "nan-version", version: Number.NaN },
        { ...validSkill, id: "fractional-version", version: 1.5 },
        { ...validSkill, id: "negative-version", version: -1 },
      ]),
    });

    await expect(controller.list()).resolves.toEqual([{
      id: "valid-skill",
      inputHints: [],
      modality: "text",
      name: "有效 Skill",
      summary: "可展示",
      version: 0,
      visibility: "private",
    }]);
  });

  it("projects app metadata through an explicit safe allowlist", async () => {
    const controller = new AppController({
      listApps: vi.fn().mockResolvedValue([{
        credentialId: "credential-1",
        description: "同步到外部应用",
        id: "app-1",
        name: "外部应用",
        provider: "secret-provider",
        signedUrl: "https://signed.example/app",
      }]),
    });

    await expect(controller.list()).resolves.toEqual({
      available: true,
      apps: [{
      description: "同步到外部应用",
      id: "app-1",
      name: "外部应用",
      }],
    });
  });

  it("reports app capability unavailable when no authenticated app client is configured", async () => {
    await expect(new AppController().list()).resolves.toEqual({
      available: false,
      apps: [],
      reason: "APP_CLIENT_UNAVAILABLE",
    });
  });

  it("exposes product model names without runtime routing details", async () => {
    const controller = new ModelController({
      listRoutes: vi.fn().mockResolvedValue([
        {
          modelDisplayName: "产品生图",
          modelKey: "product-image",
          modality: "image",
          providerName: "secret-provider",
          routeKey: "secret-route",
          upstreamModel: "secret-upstream",
          credentialId: "secret-credential",
        },
      ]),
    });

    await expect(controller.list("image")).resolves.toEqual([{
      displayName: "产品生图",
      modality: "image",
      modelKey: "product-image",
    }]);
  });
});
