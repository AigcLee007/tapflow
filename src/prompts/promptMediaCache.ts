import { getPromptMediaBlob, type PromptMediaVariant } from "../services/v2PromptsApi";

const MAX_ENTRIES = 120;
const MAX_CONCURRENT = 4;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const queue: Array<() => void> = [];
let active = 0;

function schedule<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      void work().then(resolve, reject).finally(() => { active -= 1; queue.shift()?.(); });
    };
    if (active < MAX_CONCURRENT) run(); else queue.push(run);
  });
}

export function getPromptMediaObjectUrl(mediaId: string, variant: PromptMediaVariant, adminPromptId?: string): Promise<string> {
  const key = `${adminPromptId ?? "public"}:${mediaId}:${variant}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit); }
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = schedule(async () => URL.createObjectURL(await getPromptMediaBlob(mediaId, adminPromptId, variant)))
    .then((url) => {
      cache.set(key, url);
      while (cache.size > MAX_ENTRIES) { const oldest = cache.entries().next().value as [string, string] | undefined; if (!oldest) break; cache.delete(oldest[0]); URL.revokeObjectURL(oldest[1]); }
      return url;
    }).finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export function clearPromptMediaCache(): void {
  cache.forEach((url) => URL.revokeObjectURL(url));
  cache.clear(); inflight.clear(); queue.length = 0; active = 0;
}
