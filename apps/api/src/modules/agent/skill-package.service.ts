import { z } from "zod";

const fileSchema = z.object({ path: z.string().min(1).max(200), content: z.string().max(24000).optional() }).strict();
export const skillPackageSchema = z.object({
  skillMd: z.string().min(1).max(24000),
  graphJson: z.unknown().optional(),
  files: z.array(fileSchema).max(24).optional(),
}).strict();

export type SkillPackageInput = z.infer<typeof skillPackageSchema>;

export function validateSkillPackage(input: SkillPackageInput): SkillPackageInput {
  const seen = new Set<string>();
  let declaredSkillMd: string | undefined;
  let declaredGraphJson: unknown | undefined;
  for (const file of input.files ?? []) {
    const path = file.path.replaceAll("\\", "/");
    if (path !== file.path || path.startsWith("/") || path.includes("../") || path.includes("/..") || path.includes("\0")) throw new Error("SKILL_INVALID_PACKAGE_PATH");
    if (seen.has(path)) throw new Error("SKILL_INVALID_PACKAGE_PATH");
    seen.add(path);
    if (!["SKILL.md", "graph.json"].includes(path) && !path.startsWith("references/") && !path.startsWith("assets/")) throw new Error("SKILL_INVALID_PACKAGE_FILE");
    if (/\.(js|ts|mjs|cjs|exe|dll|sh|bat|cmd|ps1)$/i.test(path)) throw new Error("SKILL_INVALID_PACKAGE_FILE");
    if (file.content && (/^(https?:|data:|blob:)/i.test(file.content.trim()) || /[A-Za-z0-9+/]{200,}={0,2}/.test(file.content))) throw new Error("SKILL_INVALID_PACKAGE_CONTENT");
    if (path === "SKILL.md") {
      declaredSkillMd = file.content;
      if (declaredSkillMd === undefined) throw new Error("SKILL_INVALID_PACKAGE_CONTENT");
    }
    if (path === "graph.json") {
      if (file.content === undefined) throw new Error("SKILL_INVALID_PACKAGE_CONTENT");
      try { declaredGraphJson = JSON.parse(file.content); } catch { throw new Error("SKILL_INVALID_PACKAGE_CONTENT"); }
    }
  }
  if (declaredSkillMd !== undefined && declaredSkillMd !== input.skillMd) throw new Error("SKILL_INVALID_PACKAGE_CONTENT");
  if (declaredGraphJson !== undefined && JSON.stringify(declaredGraphJson) !== JSON.stringify(input.graphJson)) throw new Error("SKILL_INVALID_PACKAGE_CONTENT");
  return input;
}
