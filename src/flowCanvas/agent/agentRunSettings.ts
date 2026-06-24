export type AgentImageRunSettingsTier = {
  credits: number;
  size: "1K" | "2K" | "4K";
};

export type AgentImageRunSettingsRoute = {
  estimatedCredits: number;
  routeKey: string;
  routeLabel: string;
  sizes: AgentImageRunSettingsTier[];
};

export type AgentImageRunSettingsModel = {
  aspectRatios: string[];
  defaultRouteKey: string | null;
  displayName: string;
  modelFamily: string;
  modelKey: string;
  qualityOptions: string[];
  quantityOptions: number[];
  routes: AgentImageRunSettingsRoute[];
  sizes: Array<"1K" | "2K" | "4K">;
};

export type AgentImageRunSettingsResponse = {
  models: AgentImageRunSettingsModel[];
};

export type AgentImageRunSettingsSelection = {
  aspectRatio: string;
  estimatedCredits: number;
  format?: "jpeg" | "png" | "webp";
  modelDisplayName: string;
  moderation?: "auto" | "low";
  modality: "image";
  n: number;
  quality?: string;
  routeKey: string;
  routeLabel: string;
  size: "1K" | "2K" | "4K";
};

export function getRouteTierCredits(route: AgentImageRunSettingsRoute | null | undefined, size: "1K" | "2K" | "4K"): number {
  return route?.sizes.find((item) => item.size === size)?.credits ?? route?.estimatedCredits ?? 0;
}
