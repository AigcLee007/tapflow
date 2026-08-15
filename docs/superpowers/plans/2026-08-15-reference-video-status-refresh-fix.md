# Reference Video Status Refresh Fix Plan

1. Add a hook regression that starts with a persisted `pending` status and receives a polled `ready` status.
2. Run the focused test to demonstrate the stale-status failure.
3. Prefer the latest resolved asset status over the persisted input snapshot, preserving the snapshot as a metadata-request fallback.
4. Run the focused hook and node metadata tests, then build the frontend.
5. Record the product fix, commit it, merge it into `main`, and push to GitHub.
