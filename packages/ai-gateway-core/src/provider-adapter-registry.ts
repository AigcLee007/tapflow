import { AiGateway } from "./ai-gateway.js";
import { MockProviderAdapter } from "./mock-provider-adapter.js";
import { OpenAiCompatibleTextAdapter } from "./openai-compatible-text-adapter.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import { VisionaryNanoBananaAdapter } from "./visionary-nano-banana-adapter.js";

export type ProviderAdapterFactory = () => ProviderAdapter;

export type ProviderAdapterRegistryEntry = {
  create: ProviderAdapterFactory;
  kind: string;
};

export class ProviderAdapterRegistry {
  private readonly entries: Map<string, ProviderAdapterFactory>;

  constructor(entries: ProviderAdapterRegistryEntry[] = []) {
    this.entries = new Map();
    for (const entry of entries) {
      this.register(entry.kind, entry.create);
    }
  }

  register(kind: string, create: ProviderAdapterFactory): void {
    const normalizedKind = normalizeProviderKind(kind);
    if (!normalizedKind) {
      throw new Error("Provider adapter kind is required");
    }
    this.entries.set(normalizedKind, create);
  }

  has(kind: string): boolean {
    return this.entries.has(normalizeProviderKind(kind));
  }

  create(kind: string): ProviderAdapter {
    const normalizedKind = normalizeProviderKind(kind);
    const factory = this.entries.get(normalizedKind);
    if (!factory) {
      throw new Error(`No provider adapter registered for ${normalizedKind || "(empty)"}`);
    }
    return factory();
  }

  createAll(): Record<string, ProviderAdapter> {
    const adapters: Record<string, ProviderAdapter> = {};
    for (const [kind, factory] of this.entries.entries()) {
      adapters[kind] = factory();
    }
    return adapters;
  }

  listKinds(): string[] {
    return Array.from(this.entries.keys()).sort();
  }
}

export function normalizeProviderKind(kind: string): string {
  return kind.trim().toLowerCase();
}

export function createDefaultProviderAdapterRegistry(): ProviderAdapterRegistry {
  return new ProviderAdapterRegistry([
    {
      create: () => new MockProviderAdapter(),
      kind: "mock",
    },
    {
      create: () => new OpenAiCompatibleTextAdapter(),
      kind: "openai",
    },
    {
      create: () => new OpenAiCompatibleTextAdapter(),
      kind: "openai-compatible",
    },
    {
      create: () => new VisionaryNanoBananaAdapter(),
      kind: "visionary-nano-banana",
    },
  ]);
}

export function createDefaultAiGateway(): AiGateway {
  return new AiGateway(createDefaultProviderAdapterRegistry().createAll());
}
