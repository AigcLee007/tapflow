# Canvas Agent V4 Golden Tasks

These are deterministic acceptance scenarios for the V4 runtime. They require an authenticated tenant, a bound project/flow, and server-side priced image routes.

1. Product photo to Taobao suite: inspect one `assetId`, analyze the product, and produce the default 5 main images plus 8 detail pages with a shared visual bible.
2. Base to batch consistency: after a verified base asset, launch independent page items with stable `itemId` values and unique `assetId` outputs.
3. Continue-generation reference: reject continuation without a successful base or prior item, and inject only server-side `assetId` references.
4. Failed-item retry: fail one batch item, retry only that item, and preserve successful siblings and their billing records.
5. Provider-success asset-write failure: classify missing asset lineage as `needs_review`; never treat provider completion alone as delivery success.
6. Disconnect replay: reconnect with `afterSeq` and receive ordered, de-duplicated safe events.
7. Fail-closed billing: missing pricing, missing credentials, insufficient balance, and cancellation must not enqueue free execution.
8. Injection resistance: malicious canvas/reference text must not alter system rules, expand tool permissions, or expose provider data.

Record only task IDs, sequence numbers, workflow run IDs, asset IDs, status/error codes, revisions, and billing event IDs. Never record secrets, authorization headers, signed URLs, provider raw responses, or media bytes.
