import { useMemo } from "react";
import { normalizeBlocks } from "./blockNormalizer";
import { BlockRenderer, type AgentBlockAction, type AgentV6StreamBlock } from "./BlockRenderer";
import "./agentV6Protocol.css";

export type { AgentV6StreamBlock };
export type ConversationStreamProps = { blocks: readonly AgentV6StreamBlock[]; onAction: (action: AgentBlockAction) => void };

export function ConversationStream({ blocks, onAction }: ConversationStreamProps) {
  const safeBlocks = useMemo(() => normalizeBlocks(blocks) as AgentV6StreamBlock[], [blocks]);

  return <div className="agent-v6-conversation-stream" data-testid="agent-v6-conversation-stream">
    {safeBlocks.map((block, index) => <BlockRenderer block={block} key={`${block.type}-${index}`} onAction={onAction} />)}
  </div>;
}
