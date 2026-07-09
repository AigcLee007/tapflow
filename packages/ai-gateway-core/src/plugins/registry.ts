import type { AiPluginManifest } from "./plugin-manifest.js";
import { validateAiPluginManifest } from "./plugin-manifest.js";
import { mouxiHubGptImage2Line3Manifest } from "./manifests/mouxihub-gpt-image-2-line3.js";
import { mouxiHubGptImage2Line4Manifest } from "./manifests/mouxihub-gpt-image-2-line4.js";
import { mouxiHubNanoBananaProT3Manifest } from "./manifests/mouxihub-nano-banana-pro-t3.js";
import { mockLocalDevManifest } from "./manifests/mock-local-dev.js";
import { openAiGptImage2Manifest } from "./manifests/openai-gpt-image-2.js";
import { pixelleLabsNanoBanana2Manifest } from "./manifests/pixellelabs-nano-banana-2.js";
import { pixelleLabsNanoBananaProManifest } from "./manifests/pixellelabs-nano-banana-pro.js";
import { siphonLabGpt55TextManifest } from "./manifests/siphonlab-gpt-5-5-text.js";
import { tapflowVideoEditorFfmpegManifest } from "./manifests/tapflow-video-editor-ffmpeg.js";

export const BUILTIN_AI_PLUGIN_MANIFESTS = [
  mouxiHubGptImage2Line3Manifest,
  mouxiHubGptImage2Line4Manifest,
  mouxiHubNanoBananaProT3Manifest,
  pixelleLabsNanoBanana2Manifest,
  pixelleLabsNanoBananaProManifest,
  openAiGptImage2Manifest,
  siphonLabGpt55TextManifest,
  tapflowVideoEditorFfmpegManifest,
  mockLocalDevManifest,
] as const satisfies readonly AiPluginManifest[];

export class AiPluginRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiPluginRegistryError";
  }
}

export class AiPluginRegistry {
  private readonly manifests: Map<string, AiPluginManifest>;

  constructor(manifests: readonly AiPluginManifest[] = BUILTIN_AI_PLUGIN_MANIFESTS) {
    this.manifests = new Map();

    for (const manifest of manifests) {
      const issues = validateAiPluginManifest(manifest);
      if (issues.length > 0) {
        throw new AiPluginRegistryError(
          "PLUGIN_MANIFEST_INVALID",
          `${manifest.packageKey || "(unknown package)"} is invalid: ${issues
            .map((issue) => `${issue.code}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      if (this.manifests.has(manifest.packageKey)) {
        throw new AiPluginRegistryError(
          "PLUGIN_PACKAGE_DUPLICATE",
          `Duplicate plugin package key: ${manifest.packageKey}`,
        );
      }

      this.manifests.set(manifest.packageKey, manifest);
    }
  }

  get(packageKey: string): AiPluginManifest | null {
    return this.manifests.get(packageKey) ?? null;
  }

  list(options?: {
    modality?: AiPluginManifest["modality"];
    providerKind?: string;
  }): AiPluginManifest[] {
    return Array.from(this.manifests.values())
      .filter((manifest) => !options?.modality || manifest.modality === options.modality)
      .filter((manifest) => !options?.providerKind || manifest.provider.kind === options.providerKind)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  require(packageKey: string): AiPluginManifest {
    const manifest = this.get(packageKey);
    if (!manifest) {
      throw new AiPluginRegistryError(
        "PLUGIN_PACKAGE_NOT_FOUND",
        `Plugin package not found: ${packageKey}`,
      );
    }
    return manifest;
  }
}

export const builtinAiPluginRegistry = new AiPluginRegistry();
