import { z } from "zod";

export const tapflowAgentConfigSchema = z.object({
  tapflowApiUrl: z.string().url(),
  tapflowAccessToken: z.string().trim().min(1),
  tapflowFlowId: z.string().trim().min(1),
  tapflowProjectId: z.string().trim().min(1),
  tapflowAgentSessionId: z.string().trim().min(1).optional(),
});

export type TapflowAgentConfig = z.infer<typeof tapflowAgentConfigSchema>;

export function readTapflowAgentConfig(env = process.env): TapflowAgentConfig {
  return tapflowAgentConfigSchema.parse({
    tapflowAccessToken: env.TAPFLOW_ACCESS_TOKEN,
    tapflowAgentSessionId: env.TAPFLOW_AGENT_SESSION_ID,
    tapflowApiUrl: env.TAPFLOW_API_URL,
    tapflowFlowId: env.TAPFLOW_FLOW_ID,
    tapflowProjectId: env.TAPFLOW_PROJECT_ID,
  });
}
