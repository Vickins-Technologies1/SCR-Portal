# Architecture diagrams

All diagrams below represent source-level relationships. Provider availability and deployed topology remain unverified.

## System context

```mermaid
flowchart LR
  Actors[Owners, staff, tenants, admins, public visitors]
  Mobile[Capacitor Android / iOS]
  App[My Accurate Rent<br/>Next.js modular monolith]
  DB[(MongoDB rentaldb)]
  Daraja[Daraja STK / C2B]
  Kopo[KopoKopo]
  Tuma[Tuma]
  Stripe[Stripe webhook]
  OAuth[Google OAuth]
  Notify[SMTP / SMS]
  Blob[Vercel Blob]
  Actors --> App
  Mobile --> App
  App <--> DB
  App <--> Daraja
  App <--> Kopo
  App <--> Tuma
  Stripe --> App
  App <--> OAuth
  App --> Notify
  App --> Blob
```

## Application components

```mermaid
flowchart TB
  subgraph Client[Browser / Capacitor webview]
    Pages[App Router pages and layouts]
    Shared[Shared components and hooks]
  end
  subgraph Server[Next.js runtime]
    MW[middleware.ts -> src/proxy.ts]
    API[App Router API handlers]
    Domain[src/lib domain and integration helpers]
    Native[Capacitor hosted-origin bridge]
  end
  subgraph Data[Persistence]
    Driver[MongoDB Node driver]
    Mongoose[Mongoose connection]
    Mongo[(rentaldb collections)]
  end
  subgraph External[External providers]
    Pay[Daraja / KopoKopo / Tuma / Stripe]
    Auth[Google OAuth]
    Comms[SMTP / SMS]
    Storage[Vercel Blob]
  end
  Pages --> Shared
  Shared --> MW
  MW --> API
  API --> Domain
  Domain --> Driver
  Domain --> Mongoose
  Driver --> Mongo
  Mongoose --> Mongo
  Domain <--> Pay
  Domain <--> Auth
  Domain --> Comms
  Domain --> Storage
  Native --> Pages
```

## Request lifecycle

```mermaid
sequenceDiagram
  participant C as Client
  participant P as Proxy/middleware
  participant H as Route handler
  participant L as Domain helper
  participant M as MongoDB
  C->>P: Request with session cookie
  P->>P: Verify JWT; resolve mapped role; CSRF / rate check where configured
  P->>H: Forward identity context and request ID
  H->>H: Validate input; route-specific authorization
  H->>L: Execute business operation
  L->>M: Query or mutate collections
  M-->>L: Result
  L-->>H: Domain result
  H-->>C: HTTP response
```

## Authentication and authorization

```mermaid
flowchart TD
  Start[Incoming request] --> Cookie{session cookie?}
  Cookie -- no --> Public{Public route or handler-level auth?}
  Cookie -- yes --> JWT[verifySessionToken with JWT_SECRET]
  JWT --> Valid{Valid signature and expiry?}
  Valid -- no --> Public
  Valid -- yes --> Role[Read sub, role, ownerId, managementType, tier]
  Role --> Match{Proxy route map applies?}
  Match -- no --> Handler[Handler must enforce its own access rules]
  Match -- yes --> Allowed{Role allowed?}
  Allowed -- no --> Deny[401/403 or redirect]
  Allowed -- yes --> Suspended{Owner suspended?}
  Suspended -- yes --> Deny
  Suspended -- no --> Mutating{Guarded API mutation?}
  Mutating -- yes --> CSRF[Cookie/header CSRF equality check]
  CSRF --> Continue[Forward request]
  Mutating -- no --> Continue
  Continue --> Handler
```

## Database interaction and payment posting

```mermaid
flowchart LR
  Route[Provider/manual route] --> Verify[Provider evidence + payment correlation]
  Verify --> Pending[(payments document)]
  Pending --> Post[postVerifiedPayment]
  Post --> Check[Amount, tenant/property and duplicate checks]
  Check --> Quarantine{Mismatch?}
  Quarantine -- yes --> Review[financialPostingStatus=quarantined]
  Quarantine -- no --> Claim[Conditional processing claim]
  Claim --> Allocation[reconcileTenantPaymentAllocation]
  Allocation --> Tenant[(tenants cached totals)]
  Allocation --> Payment[(payments allocation projection)]
  Claim --> Ledger[(financialLedger eventKey unique)]
  Claim --> Wallet[(walletTransactions eventKey unique)]
  Claim --> Invoice[Reconcile invoice balance/status]
  Ledger --> Posted[financialPostingStatus=posted]
```

## External payment integration

```mermaid
sequenceDiagram
  participant User
  participant App as Next.js API
  participant Provider as Payment provider
  participant DB as MongoDB
  User->>App: Initiate payment
  App->>DB: Validate relationship and persist pending record
  App->>Provider: STK / collection request
  Provider-->>User: Provider prompt or payment instructions
  Provider->>App: Signed/structured callback (provider-dependent)
  App->>DB: Correlate, claim/idempotency, preserve unmatched callbacks
  App->>App: Validate confirmed amount and call shared posting service
  App->>DB: Allocation, ledger, invoice reconciliation, posting marker
  App-->>Provider: Provider-specific acknowledgement
```

Signature guarantees differ by provider. KopoKopo and Stripe verify signatures in the inspected handlers. Daraja callback correlation/claims are present, but a Daraja callback signature check was not found. C2B validation and confirmation endpoints are separate interfaces.

## Main data relationships

```mermaid
erDiagram
  PROPERTY_OWNER ||--o{ PROPERTY : owns
  PROPERTY ||--o{ TENANT : contains
  PROPERTY_OWNER ||--o{ TEAM_MEMBER : manages
  TENANT ||--o{ PAYMENT : pays
  PROPERTY ||--o{ PAYMENT : associated_with
  TENANT ||--o{ UTILITY_CHARGE : incurs
  PAYMENT ||--o{ FINANCIAL_LEDGER : posted_or_reversed
  PAYMENT ||--o{ WALLET_TRANSACTION : credits_or_consumes
  INVOICE ||--o{ PAYMENT : settled_by
  PROPERTY_OWNER ||--o{ PROPERTY_LISTING : advertises
  PROPERTY_OWNER ||--o{ AIRBNB_LISTING : operates
  AIRBNB_LISTING ||--o{ AIRBNB_BOOKING : receives
  AIRBNB_BOOKING ||--o{ PAYMENT : may_settle
  PROPERTY_OWNER ||--o{ LANDLORD_MPESA : routes_collection
```

Edges express observed identifier relationships, not database-enforced foreign keys. Collection names are inferred from native driver calls; entity field shapes are not governed by formal schemas except `LandlordMpesa`.

## Deployment architecture

```mermaid
flowchart TB
  Browser[Web browser]
  Native[Android / iOS Capacitor shell]
  Vercel[Vercel Next.js deployment<br/>configured, live state unverified]
  Cron[Vercel cron HTTP requests]
  Mongo[(MongoDB service<br/>provider/topology unverified)]
  Vendors[Payment, OAuth, mail, SMS and blob providers]
  Browser --> Vercel
  Native -->|hosted URL configured| Vercel
  Cron --> Vercel
  Vercel <--> Mongo
  Vercel <--> Vendors
```

`vercel.json` configures install/build commands and cron schedules. It does not prove the project is currently deployed or that the cron requests authenticate successfully.
