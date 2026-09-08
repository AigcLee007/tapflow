import type { ReactNode } from "react";
import type { BriefField, ConversationBlock } from "./conversationTypes";
import { UnderstandingBlock } from "./blockRenderers/UnderstandingBlock";
import { QuestionBlock } from "./blockRenderers/QuestionBlock";
import { ChoiceGridBlock } from "./blockRenderers/ChoiceGridBlock";
import { ComparisonBlock } from "./blockRenderers/ComparisonBlock";
import { BriefBlock } from "./blockRenderers/BriefBlock";
import { ConfirmationBlock } from "./blockRenderers/ConfirmationBlock";
import { ProgressBlock } from "./blockRenderers/ProgressBlock";
import { ResultGroupBlock } from "./blockRenderers/ResultGroupBlock";

export type AgentV6StreamBlock = ConversationBlock;

export type AgentBlockAction =
  | { type: "answer_question"; blockId: string; value: string }
  | { type: "select_choice"; blockId: string; optionIds: string[] }
  | { type: "edit_brief"; blockId: string }
  | { type: "submit_brief"; blockId: string; fields: BriefField[] }
  | { type: "revise_brief"; blockId: string }
  | { type: "confirm_execution"; blockId: string }
  | { type: "revise_plan"; blockId: string }
  | { type: "cancel_progress"; blockId: string }
  | { type: "retry_progress"; blockId: string; stepId: string }
  | { type: "revise_progress"; blockId: string; stepId: string }
  | { type: "recover_progress"; blockId: string; stepId: string }
  | { type: "select_result"; resultId: string }
  | { type: "preview_result"; resultId: string }
  | { type: "refine_result"; resultId: string }
  | { type: "variant_result"; resultId: string }
  | { type: "set_reference"; resultId: string }
  | { type: "place_result"; resultId: string };

export function BlockRenderer(props: { block: AgentV6StreamBlock; onAction: (action: AgentBlockAction) => void }): ReactNode {
  const { block, onAction } = props;
  switch (block.type) {
    case "understanding": return <UnderstandingBlock block={block} />;
    case "question": return <QuestionBlock block={block} onAction={onAction} />;
    case "choice_grid": return <ChoiceGridBlock block={block} onAction={onAction} />;
    case "comparison_table": return <ComparisonBlock block={block} />;
    case "brief_card": return <BriefBlock block={block} onAction={onAction} />;
    case "confirmation_card": return <ConfirmationBlock block={block} onAction={onAction} />;
    case "progress_card": return <ProgressBlock block={block} onAction={onAction} />;
    case "result_group": return <ResultGroupBlock block={block} onAction={onAction} />;
    case "paragraph": return <p className="agent-v6-paragraph">{block.text}</p>;
    case "heading": {
      const Heading = `h${block.level}` as "h1" | "h2" | "h3";
      return <Heading className="agent-v6-heading">{block.text}</Heading>;
    }
    case "quote": return <blockquote className="agent-v6-quote">{block.text}</blockquote>;
    case "bullet_list": return <ul className="agent-v6-list">{block.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
    case "numbered_list": return <ol className="agent-v6-list">{block.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>;
    case "divider": return <hr className="agent-v6-divider" />;
    default: return null;
  }
}
