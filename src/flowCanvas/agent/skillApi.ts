import { apiGet, apiPatch, apiPost } from "../../services/v2HttpClient";
import type { AgentSkillPreview } from "./canvasAgentApi";

export type SkillSourceDraft = {
  askWhen: string;
  category?: string;
  inputs: string;
  method: string;
  modality: "text" | "image" | "video";
  name: string;
  outputs: string;
  summary: string;
  triggers?: string[];
  usageScenarios: string;
};

export type SkillDraftView = {
  graph?: unknown | null;
  id: string;
  ownerUserId: string;
  revision: number;
  source: SkillSourceDraft;
};

export function listSkills(input?: { modality?: SkillSourceDraft["modality"]; q?: string; scope?: "available" | "mine" }) {
  const query = new URLSearchParams({ scope: input?.scope ?? "available" });
  if (input?.modality) query.set("modality", input.modality);
  if (input?.q) query.set("q", input.q);
  return apiGet<AgentSkillPreview[]>(`/agent/skills?${query.toString()}`);
}

export function getSkillDraft(skillId: string) {
  return apiGet<SkillDraftView>(`/agent/skills/${encodeURIComponent(skillId)}`);
}

export function createSkillDraft(source: SkillSourceDraft) {
  return apiPost<SkillDraftView>("/agent/skills/drafts", { source });
}

export function updateSkillDraft(skillId: string, source: SkillSourceDraft, expectedRevision: number) {
  return apiPatch<SkillDraftView>(`/agent/skills/${encodeURIComponent(skillId)}/draft`, { expectedRevision, source });
}

export function publishSkill(skillId: string, source: SkillSourceDraft) {
  return apiPost<AgentSkillPreview>(`/agent/skills/${encodeURIComponent(skillId)}/publish`, { source });
}

export function authorSkillTurn(input: { draft: Partial<SkillSourceDraft>; userMessage: string }) {
  return apiPost<{
    assistantReply: string;
    missingQuestions: string[];
    readyToPreview: boolean;
    sourcePatch: Partial<SkillSourceDraft>;
    validationNotes: string[];
  }>("/agent/skills/authoring/turn", input);
}
