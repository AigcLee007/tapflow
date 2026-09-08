export type AppDisplayMetadata = {
  description?: string;
  id: string;
  name: string;
};

export type AppCatalogAdapter = () => Promise<readonly unknown[]>;

export class AppController {
  private readonly listApps: AppCatalogAdapter;

  constructor(options: { listApps?: AppCatalogAdapter } = {}) {
    this.listApps = options.listApps ?? (async () => []);
  }

  async list(): Promise<AppDisplayMetadata[]> {
    const items = await this.listApps();
    return items.flatMap((value) => {
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return [];
      return [{
        ...(typeof value.description === "string" && value.description.trim() ? { description: value.description } : {}),
        id: value.id,
        name: value.name,
      }];
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
