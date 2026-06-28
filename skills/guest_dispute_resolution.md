---
skill: guest_dispute_resolution
version: v1.2.0
status: promoted
---

# Guest Dispute Resolution

## Current Policy

Late-checkout fees are non-refundable by default.

## Known Gap

The current skill does not distinguish between ordinary late checkout and host pre-approved late checkout. This causes some valid guest disputes to be denied.

## Safety Boundary

Do not issue refunds for arbitrary complaints, unsupported requests, unapproved late checkout, or refunds above the local policy cap.

## Candidate Improvement Target

A candidate skill should resolve host pre-approved late-checkout disputes while preserving refund safety boundaries.
