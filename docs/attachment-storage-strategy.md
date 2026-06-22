# ShiftFlow Attachment Storage Strategy

## Current Decision

Attachment metadata belongs in PostgreSQL. Binary attachment content should be stored outside the database in an environment-specific object store.

## Recommended Production Model

- Store files in S3-compatible object storage.
- Store only metadata, ownership, status, and object keys in PostgreSQL.
- Use private buckets by default.
- Serve downloads through short-lived signed URLs.
- Enforce authorization in the API before issuing a signed URL.
- Scan uploaded files before marking them available.

## Required Metadata

- `companyId`
- `clientId`
- `teamId`
- `activityId` or related entity id
- original filename
- MIME type
- byte size
- object key
- checksum
- upload status
- created by user id
- created at
- deleted at for soft delete

## Environment Mapping

- Local: filesystem or local S3-compatible service for development only.
- Staging: isolated bucket with staging credentials.
- Production: private production bucket with lifecycle and retention policies.

## Security Controls

- Never expose raw bucket credentials to the browser.
- Validate file size and MIME type on upload.
- Generate collision-resistant object keys.
- Keep audit logs for upload, download, delete, and restore events.
- Apply retention rules according to operational policy.

## Pending Implementation

This document defines the production strategy only. Implementing upload/download flows requires a future approved development phase and must not be treated as part of STATE-08 release execution.
