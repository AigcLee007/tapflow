export type AppDisplayMetadata = {
  description?: string;
  id: string;
  name: string;
};

export type AppCatalogAdapter = () => Promise<readonly unknown[]>;

export type AppCatalogResult =
  | { available: true; apps: AppDisplayMetadata[] }
  | { available: false; apps: []; reason: "APP_CLIENT_UNAVAILABLE" };

export class AppController {
  private readonly listApps?: AppCatalogAdapter;

  constructor(options: { listApps?: AppCatalogAdapter } = {}) {
    this.listApps = options.listApps;
  }

  async list(): Promise<AppCatalogResult> {
    if (!this.listApps) return { available: false, apps: [], reason: "APP_CLIENT_UNAVAILABLE" };
    const items = await this.listApps();
    const apps = items.flatMap((value) => {
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return [];
      return [{
        ...(typeof value.description === "string" && value.description.trim() ? { description: value.description } : {}),
        id: value.id,
        name: value.name,
      }];
    });
    return { available: true, apps };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
