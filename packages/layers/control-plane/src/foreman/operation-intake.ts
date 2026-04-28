import type { ProposedAction } from "./types.js";

export interface MissingInformationDraftReplyInput {
  assumed_intent: string;
  required_inputs: string[];
}

export function buildMissingInformationDraftReply(input: MissingInformationDraftReplyInput): ProposedAction {
  const requiredInputs = input.required_inputs.map((item) => item.trim()).filter(Boolean);
  const fields = requiredInputs.length > 0
    ? requiredInputs.join(", ")
    : "the missing information needed to proceed";
  return {
    action_type: "draft_reply",
    authority: "recommended",
    payload_json: JSON.stringify({
      body_text: `I assume you mean you want to ${input.assumed_intent}. To proceed, please provide ${fields}.`,
    }),
    rationale: "Missing operation inputs are mapped to a governed draft reply; no external operation effect is authorized.",
  };
}
