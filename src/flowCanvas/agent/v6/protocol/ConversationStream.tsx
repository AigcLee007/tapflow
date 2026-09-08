import { useMemo } from "react";
import { normalizeBlocks } from "./blockNormalizer";
import { BlockRenderer, type AgentBlockAction, type AgentV6StreamBlock } from "./BlockRenderer";
import "./agentV6Protocol.css";

export type { AgentV6StreamBlock };
export type ConversationStreamProps = { blocks: readonly AgentV6StreamBlock[]; onAction: (action: AgentBlockAction) => void };

export function ConversationStream({ blocks, onAction }: ConversationStreamProps) {
  const safeBlocks = useMemo(() => blocks.flatMap((block) => {
    if (block.type === "understanding" || block.type === "question") {
      return [block.type === "understanding"
        ? { type: "understanding" as const, ...(typeof block.title === "string" ? { title: block.title.slice(0, 400) } : {}), text: block.text.slice(0, 4000) }
        : { type: "question" as const, id: block.id.slice(0, 128), ...(typeof block.title === "string" ? { title: block.title.slice(0, 400) } : {}), prompt: block.prompt.slice(0, 4000), options: block.options.slice(0, 12).map((option) => option.slice(0, 400)) }];
    }
    const normalized = normalizeBlocks([block]) as AgentV6StreamBlock[];
    if (normalized.length === 0 || !("id" in block) || !block.id) return normalized;
    const normalizedBlock = normalized[0];
    if (normalizedBlock.type === "brief_card" || normalizedBlock.type === "confirmation_card" || normalizedBlock.type === "progress_card" || normalizedBlock.type === "result_group" || normalizedBlock.type === "choice_grid") {
      return [{ ...normalizedBlock, id: block.id.slice(0, 128), ...(normalizedBlock.type === "choice_grid" && "locked" in block && block.locked === true ? { locked: true } : {}) }];
    }
    return normalized;
  }), [blocks]);

  return <div className="agent-v6-conversation-stream" data-testid="agent-v6-conversation-stream">
    {safeBlocks.map((block, index) => <BlockRenderer block={block} key={`${block.type}-${index}`} onAction={onAction} />)}
  </div>;
}
