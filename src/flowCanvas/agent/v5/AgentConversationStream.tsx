import React from "react";
import type { ConversationBlock } from "./agentV5Types";
import { AgentBlockRenderer, type AgentBlockAction } from "./AgentBlockRenderer";

export function AgentConversationStream(props: { blocks: ConversationBlock[]; onAction: (action: AgentBlockAction) => void }) {
  return <div className="agent-v5-conversation-stream" data-testid="agent-v5-conversation-stream">{props.blocks.map((block, index) => <AgentBlockRenderer block={block} key={`${block.type}-${index}`} onAction={props.onAction} />)}</div>;
}
