# My Accurate Rent architecture documentation

This documentation describes the implementation present in this repository at the audit date, 13 October 2026. It is based on static inspection of the checked-out source, committed configuration, and existing project documentation. It does not establish that a deployment or connected service is live.

## System at a glance

My Accurate Rent is a Next.js 16 application written in TypeScript, with React 19, a MongoDB database, server-side route handlers, and Capacitor Android/iOS wrappers. It is a single deployable application with domain-oriented modules rather than a set of separately deployed backend services. Owner and tenant property management, platform administration, public listings, Airbnb-style short-stay operations, billing, payments, reporting, and messaging are implemented in the same source tree.

Most routes use the MongoDB Node.js driver directly. A Mongoose connection/model is also used for landlord-configured payment routing. Financial records live in Mongo collections and are coordinated through shared posting, allocation, ledger, and reporting helpers; several older handlers and reporting projections remain separate paths.

## How to use these documents

| Document | Contents |
| --- | --- |
| [System overview](SYSTEM_OVERVIEW.md) | Boundaries, architectural style, system context, integrations |
| [Application architecture](APPLICATION_ARCHITECTURE.md) | Runtime, frontend/backend layers, request flow, source map |
| [Database architecture](DATABASE_ARCHITECTURE.md) | Persistence entities, relationships, indexes, integrity risks |
| [Business modules](BUSINESS_MODULES.md) | Roles, permissions, feature status, code traceability |
| [Financial engine](FINANCIAL_ENGINE.md) | Dues, allocations, ledger, invoices, reports and payment posting |
| [Payment gateway architecture](PAYMENT_GATEWAY_ARCHITECTURE.md) | Daraja, C2B, KopoKopo, Tuma, Stripe and callback behavior |
| [API reference](API_REFERENCE.md) | Route families, methods, auth layers, handler conventions |
| [Security audit](SECURITY_AUDIT.md) | Defensive findings with source evidence and severity |
| [Deployment and operations](DEPLOYMENT_AND_OPERATIONS.md) | Vercel, scheduled routes, environment names, mobile packaging |
| [Testing and reliability](TESTING_AND_RELIABILITY.md) | Existing tests, execution limitations, recommended cases |
| [Architectural risks](ARCHITECTURAL_RISKS.md) | Prioritized remediation roadmap |
| [Architecture diagrams](ARCHITECTURE_DIAGRAMS.md) | Mermaid context, components, requests, auth, data and deployment |

## Status convention

- **Verified** — directly visible in source or checked-in configuration.
- **Partially verified** — the repository proves part of the behavior, but operational or end-to-end details are unavailable.
- **Inferred** — a reasonable interpretation of the code structure, not an explicit guarantee.
- **Unverified** — requires runtime, database, hosting account, or provider access.
- **Not implemented** — no implementation was found after searching the relevant repository areas; this does not rule out external/manual processes.
- **Planned** — stated as future work in project materials.

## Scope and evidence limits

The audit inspected `src/app`, `src/lib`, `src/models`, `src/types`, tests, root configuration, `.env.example` variable names, and existing documentation. Secret values and `.env.local` were not read or included. The app has 194 API `route.ts` handlers; route-level behavior varies, so this is a source map and architecture audit rather than a complete contract test for every request/response combination.

No production database, provider console, Vercel dashboard, CI system, live credentials, or real customer records were accessed. No application behavior or configuration was changed. Existing `AUDIT_PAYMENT_FLOW.md` contains historical observations that differ from current code in several places; current source was treated as authoritative for this documentation.
