import type { Job } from "bullmq";

import { PersonalWalletService } from "@aigc-flow/db";
import type { WalletExpiryJobPayload } from "@aigc-flow/redis";

import type { WorkerLogger } from "../logger.js";

export async function processWalletExpiryJob(
  job: Job<WalletExpiryJobPayload>,
  logger: WorkerLogger,
  options?: { walletService?: PersonalWalletService },
): Promise<{ expiredCredits: number; expiredGrantCount: number }> {
  const walletService = options?.walletService ?? new PersonalWalletService();
  const result = await walletService.expireDueGrants({ limit: job.data.limit ?? 500 });
  logger.info({
    expiredCredits: result.expiredCredits,
    expiredGrantCount: result.expiredGrantCount,
    jobId: job.id ?? null,
    queueName: job.queueName,
  }, "completed personal wallet expiry sweep");
  return result;
}
