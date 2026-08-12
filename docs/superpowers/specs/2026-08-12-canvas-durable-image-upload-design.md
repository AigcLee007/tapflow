# Canvas Durable Image Upload Design

## Goal

New images uploaded directly into a project canvas become durable tenant assets in object storage. Standalone workbench reference uploads remain temporary PostgreSQL `bytea` records. Existing canvas drafts that already reference temporary uploads are not migrated.

## Scope

The project canvas must use the existing `/api/v2/assets` upload flow for all new local-image entry points:

- canvas drag-and-drop and paste image insertion;
- the image node's primary local-file upload action;
- the image node's local reference-upload action, which currently creates temporary `referenceUploadId` records.

Each successful upload creates an `assets` record and writes the original binary to the configured S3-compatible object store. The resulting canvas node or reference list persists the returned `assetId`. Browser object URLs remain an immediate, non-authoritative preview only until a signed asset preview can be used.

## Explicitly Unchanged

- `/api/v2/workbench/reference-uploads` continues to store standalone workbench reference images in `workbench_reference_uploads.bytes` with its existing seven-day expiry.
- Existing canvas nodes carrying `referenceUploadId` are not migrated, rewritten, or extended. They retain current expiry behavior.
- Asset API, storage schema, object-key format, and signing behavior are reused without new tables or migrations.

## Data Flow

```text
Canvas local File
  -> immediate browser blob preview
  -> POST /api/v2/assets/presigned-upload
  -> signed PUT to S3-compatible storage (API fallback if required)
  -> POST /api/v2/assets/:assetId/complete-upload
  -> node/reference data stores assetId
  -> canonical draft persists asset IDs, never blob/data/signed URLs
```

The standalone workbench remains separate:

```text
Workbench reference File
  -> POST /api/v2/workbench/reference-uploads
  -> workbench_reference_uploads.bytes (temporary bytea)
  -> referenceUploadId
```

## Error Handling

The optimistic local preview remains visible while an asset upload is pending. A failed upload retains the existing upload-failure status and does not write a temporary-reference record. Once the asset upload succeeds, local object URLs are revoked unless still needed by an active preview.

## Verification

- Unit tests prove canvas-facing helper calls `uploadAssetFile`, returns asset-backed node data, and does not call `uploadReferenceImageFile`.
- Focused canvas/node tests prove direct image insertion and local reference upload persist asset IDs.
- Existing workbench reference-upload tests continue to prove the temporary API path remains in use.
- `npm run build` passes.
