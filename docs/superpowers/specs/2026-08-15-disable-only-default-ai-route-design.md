# Disable Only Default AI Route

## Goal

Allow an administrator to take a broken AI route out of service even when it is the model's only/default route, while hiding the product model from creator-facing model catalog responses until an active route is available again.

## Design

The model center will allow the existing route status action for a default route. The existing API update flow already demotes an updated route when its runtime status changes and clears the catalog's default route key. The catalog query already requires an active route, so no new model-level status or database migration is needed. This keeps route status authoritative and avoids a second availability flag.

After the route is disabled, the model center shows the route as inactive and the creator-facing catalog omits the product model because its `EXISTS` active-route condition is false. When upstream service is restored, an administrator enables the route, tests it, and explicitly sets it as default. Existing authorization, tenant isolation, audit logging, billing history, and route records remain unchanged.

## UI and Error Handling

- Remove the UI restriction that disables the enable/disable action when the selected route is the current default.
- Keep editing/deleting restrictions unchanged.
- Preserve the existing confirmation-free status toggle and success/error messages.
- If the route is platform-owned, status updates remain governed by the existing API permission and ownership checks.

## Verification

- Add a frontend regression test proving the default route status action is enabled and calls `updateAdminRoute` with `status: "inactive"`.
- Keep/extend catalog service coverage proving a model with no active route is omitted.
- Run focused tests, the relevant workspace tests, and `npm run build`.
