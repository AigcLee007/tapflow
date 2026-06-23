export type AgentAssetKind = "image" | "video";

export type AgentAssetReferenceInput = {
  assetId: string;
  height?: number | null;
  index: number;
  kind: AgentAssetKind;
  prompt?: string | null;
  roundIndex: number;
  width?: number | null;
};

export type AgentAssetReference = {
  assetId: string;
  height?: number;
  kind: AgentAssetKind;
  label: string;
  promptSummary: string;
  refId: string;
  width?: number;
};

export type AgentToolResultReferences = {
  assetRefs: AgentAssetReference[];
  status: "failed" | "succeeded";
  toolCallId: string;
};

const PROMPT_SUMMARY_MAX_LENGTH = 160;

function summarizePrompt(prompt: string | null | undefined): string {
  const normalized = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= PROMPT_SUMMARY_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, PROMPT_SUMMARY_MAX_LENGTH - 3)}...`;
}

export function buildAgentAssetReference(input: AgentAssetReferenceInput): AgentAssetReference {
  const ordinal = input.index + 1;
  return {
    assetId: input.assetId,
    ...(typeof input.height === "number" ? { height: input.height } : {}),
    kind: input.kind,
    label: `Round ${input.roundIndex} ${input.kind} ${ordinal}`,
    promptSummary: summarizePrompt(input.prompt),
    refId: `round-${input.roundIndex}-${input.kind}-${ordinal}`,
    ...(typeof input.width === "number" ? { width: input.width } : {}),
  };
}

export function buildAgentToolResultReferences(input: {
  assets: Array<Omit<AgentAssetReferenceInput, "index" | "roundIndex">>;
  roundIndex: number;
  status: AgentToolResultReferences["status"];
  toolCallId: string;
}): AgentToolResultReferences {
  return {
    assetRefs: input.assets.map((asset, index) => buildAgentAssetReference({
      ...asset,
      index,
      roundIndex: input.roundIndex,
    })),
    status: input.status,
    toolCallId: input.toolCallId,
  };
}
