import { z } from "zod";

const packageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/i,
    "packageKey must contain only letters, numbers, dot, underscore, or hyphen",
  );

function normalizeHttpUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrlOverride must use http or https");
  }
  return url.toString();
}

export const pluginPackageParamsSchema = z.object({
  packageKey: packageKeySchema,
});

export const pluginInstallParamsSchema = z.object({
  installId: z.string().uuid(),
});

export const listPluginsQuerySchema = z.object({
  modality: z.enum(["image", "text", "video"]).optional(),
});

export const installPluginSchema = z.object({
  baseUrlOverride: z
    .string()
    .trim()
    .url()
    .transform(normalizeHttpUrl)
    .nullable()
    .optional(),
  credential: z
    .object({
      name: z.string().trim().min(1).max(255).optional(),
      secret: z.string().trim().min(1).max(4000).optional(),
    })
    .optional(),
  pricingOverrides: z
    .array(
      z.object({
        minChargeCredits: z.number().int().min(1).max(1_000_000_000),
        modelKey: z.string().trim().min(1).max(255),
        routeKey: packageKeySchema,
        unitCredits: z.number().int().min(1).max(1_000_000_000),
      }),
    )
    .optional(),
  publishImmediately: z.boolean().optional(),
});

export type InstallPluginInput = z.infer<typeof installPluginSchema>;
export type ListPluginsQuery = z.infer<typeof listPluginsQuerySchema>;
export type PluginInstallParams = z.infer<typeof pluginInstallParamsSchema>;
export type PluginPackageParams = z.infer<typeof pluginPackageParamsSchema>;
