# Company admin

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Platform reviewers employed by the company, who verify doctors, drivers and facilities before they can operate on the network.

## Product Purpose

The internal reviewer console: an overview, a verification queue, case details, document decisions and final verification.

## Operating Context

Desktop use by trained internal staff working through a queue of cases. Accuracy and an auditable trail matter more than speed or visual expression.

## Capabilities and Constraints

- Next.js App Router application using `@startup/web-ui`, `@startup/contracts` and `@startup/data-access`.
- Every protected page and action is gated by the server-side reviewer check.
- Not customer-facing; no marketing or brand-expression surfaces.

## Product Principles

1. **Decisions are deliberate**: approving or rejecting is clear, confirmable and recorded.
2. **Evidence beside the decision**: documents and case facts sit next to the action they inform.
