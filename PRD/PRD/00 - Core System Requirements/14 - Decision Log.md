Core System Requirements

Document 14 of 15 · Modern 3PL Warehouse Operating System (web application)

14. Decision Log (All Open Questions with Recommendations)

Item

Detail

Purpose

Every open question from the master PRD and all sprint PRDs in one place, with a recommended answer, an owner and a decide-by point. Teams confirm or change each recommendation before the sprint that needs it starts.

Parent documents

PRD — Modern 3PL Warehouse Operating System (v1.1); Phase 1–4 sprint PRDs (PRD\Phase 1…4 folders)

How to use

Review weekly. Change 'Status' to Decided (with the final answer and date) or Deferred (with a new decide-by). Phase 1 decisions must be closed before Sprint 00 or the named sprint starts.

Totals

143 decisions: 12 strategic, 43 Phase 1, 31 Phase 2, 30 Phase 3, 27 Phase 4

Version / Date / Status

1.0 (Draft) · September 26, 2026 · Draft for review



1. Strategic Decisions (Master PRD §14)

ID

Question

Recommended answer

Owner

Decide by

Status

S.1

Product name & brand

Run a naming sprint with 3–5 candidates → trademark + domain check → pick before the marketing site and design-partner outreach (Launch checklist L7).

Founder

Validation gate (Doc 12)

Open

S.2

Launch geography

US first (the research, pricing, carriers and compliance all assume it). Treat any home-market launch as a Phase 4 market pack.

Founder

Validation gate (Doc 12)

Open

S.3

Extensiv migration feasibility (API access, legal)

Desk research (Sept 2026): the API is publicly documented and 3PLs can self-provision keys for external developers, so customer-authorised extraction is a supported workflow. Remaining: legal review of API terms, rate limits, possible connection fees, and rate-card extraction (assume UI export). Confirm all in the Doc 12 test. Fallback: assisted CSV migration.

Tech lead + Founder

Validation gate (Doc 12)

Open

S.4

Billing in MVP: export bridge acceptable?

Yes, the export bridge plus Stripe-billed invoices from the 3PL's accounting tool. Confirm in interviews; if 2+ partners refuse, pull basic invoicing into Sprint 14.

Founder

Validation gate (Doc 12)

Open

S.5

Warehouse hardware standard

Standardise on keyboard-wedge scanners + Zebra-class ZPL printers + a print connector. Confirm per site in the hardware survey (Doc 12 Track C).

Tech lead + Founder

Validation gate (Doc 12)

Open

S.6

Build vs partner (rate shopping, EDI, payments)

Rate shopping: EasyPost or Shippo (decide in Phase 2 · Sprint 9). EDI: Stedi first. Payments: Stripe. Pass provider fees through at cost, shown transparently.

Founder

Validation gate (Doc 12)

Open

S.7

Pricing validation & AI packaging

Test the tiers in the interviews (willingness to pay). Include AI copilot in Growth/Scale. Price autonomous optimisation as an add-on only if measured savings are proven.

Founder

Validation gate (Doc 12)

Open

S.8

Pack-photo retention & privacy

180-day default retention, capture only multi-item/high-value orders by default, private storage, documented privacy notice for workers.

Founder

Validation gate (Doc 12)

Open

S.9

Phase 3 network & marketplace fee model

Decide in Phase 3: per-order network fee + marketplace success fee; free listings.

Founder

Phase 3 planning

Open

S.10

HIPAA / health data stance

Prohibit PHI in Phases 1–2 via the terms of service. Revisit only if a healthcare 3PL design partner needs it (then BAAs with us and our sub-processors, plus extra controls).

Founder

Validation gate (Doc 12)

Open

S.11

Public 3PL directory earlier (Phase 2 lite) or Phase 3 only?

Keep the public directory in Phase 3 by default. Launch a lightweight directory (profiles + proximity search, no RFP matching) in Phase 2 only if marketing wants early SEO/brand acquisition and at least 10 3PLs are live to list.

Founder

Phase 2 planning

Open

S.12

AI crawler policy for public pages (allow training crawlers or search-only?)

Allow search/answer crawlers and AI training crawlers on public marketing, docs and directory pages (the goal is to be known and recommended); block all bots from the app, floor, portal, internal and API paths. Review yearly.

Founder

Validation gate (Doc 12)

Open

2. Phase 1 — The Wedge (MVP)

ID

Question

Recommended answer

Owner

Decide by

3PL input

Status

1.00.1

Worker host choice (Fly.io vs Render) and logging provider (decided in the decision log before this sprint).

Fly.io for workers (long-running, US-East) and Better Stack for logs/uptime/status page, unless the team already runs alternatives.

Tech lead

Validation gate



Open

1.00.2

Monorepo tool preference (Turborepo recommended) if the team has an existing standard.

Turborepo + pnpm workspaces.

Tech lead

Validation gate



Open

1.1.1

Badge/PIN vs. full accounts for Floor Workers: confirm the PIN approach and whether badges should also support a scannable QR login.

Decided in the specs: badge (QR/Code 128 random token) + PIN on registered floor devices for floor workers; office users use email + password, Google, GitHub or Microsoft. Confirm with design partners.

Product owner

Before P1 S1



Open

1.1.2

Should Billing role users see operational data (orders, inventory) read-only, or only billing screens?

Read-only operational views plus full billing screens.

Product owner

Before P1 S1



Open

1.1.3

Default carrier cutoffs: per facility only, or per facility + carrier + service level? (Affects the Phase 3 SLA prediction model.)

Per facility + carrier (+ optional service level). Store it in that shape now for Phase 3 SLA prediction.

Product owner

Before P1 S1



Open

1.2.1

Worker runtime: Supabase Edge Function cron vs. a long-running Node worker (e.g. on Fly/Render) for consumer throughput. Recommend a spike on Day 1.

Long-running Node worker (Fly.io) for queue consumers; Edge Functions only for webhooks/auth.

Tech lead

Before P1 S2



Open

1.2.2

Maximum allowed back-dating for occurred_at on queued scans (proposed 72h with supervisor override).

72 hours, with supervisor override beyond that.

Product owner

Before P1 S2



Open

1.2.3

Should event payloads store denormalised display data (SKU code, location code) for audit readability, or IDs only?

Store IDs plus a small denormalised snapshot (SKU code, location code, lot) for audit readability.

Product owner

Before P1 S2



Open

1.2.4

New floor terminals: must a supervisor approve each one before it can record scans, or can workers scan as soon as they sign in on it?

Decided (2026-10-09): trust on first use by default. The first badge + PIN sign-in registers and activates the terminal; its warehouse is set automatically when the worker has one, otherwise the terminal asks once. Organizations can turn on "Require approval for new terminals" for stricter control. Supervisors can block or retire a device at any time, which signs everyone out of it.

Product owner

Before P1 S2



Decided

1.02A.1

Analytics tool: PostHog (recommended, US cloud) vs an alternative your team already uses.

PostHog US Cloud (product analytics + feature flags option).

Tech lead

Before P1 S02A



Open

1.02A.2

Should design partners be on Stripe from day one (with a 100% coupon until go-live) to test the billing flow early? Recommended: yes.

Yes. Create design partners in Stripe with a 100% coupon until go-live, so billing flows are tested early.

Product owner

Before P1 S02A

Yes

Open

1.3.1

Default convention for design partners: adopt the standard template, or mirror each partner's existing Extensiv location codes during migration (Sprint 15 can map old → new)?

Adopt the standard template for new layouts. Map old Extensiv codes as aliases during migration so old labels still scan.

Product owner

Before P1 S3

Yes

Open

1.3.2

Are Building and Wing levels needed for single-building partners, or hidden by default?

Hidden by default for single-building sites (auto-filled), shown when a second building/wing is added.

Product owner

Before P1 S3



Open

1.3.3

Floor-cell labels: floor-mounted barcode labels, hanging signs, or both (depends on forklift traffic)?

Both: floor-mounted labels at cell/lane ends plus hanging signs in high-forklift areas. Confirm in the site survey.

Product owner

Before P1 S3



Open

1.4.1

GS1-128 parsing (AI 10 lot, AI 17 expiry, AI 21 serial) on inbound: in Phase 1 (MVP) or Phase 2? Recommend Phase 1 (MVP) because supplement/cosmetics design partners need it.

Phase 1 (supplement/cosmetics partners need GS1 lot/expiry parsing at receiving).

Product owner

Before P1 S4

Yes

Open

1.4.2

Are SKU dimensions mandatory for all clients, or only for clients billed by cubic volume?

Mandatory for storage-billed-by-cube clients and for any SKU using cartonization later. Otherwise strongly recommended (completeness score).

Product owner

Before P1 S4



Open

1.5.1

Approval threshold defaults (proposal: >10 units or >5% of the location balance).

Approval needed above 10 units or 5% of the location balance, whichever is lower; always for serialised units.

Product owner

Before P1 S5



Open

1.5.2

Should 'allocated' be a balance status (as designed) or a separate reservation table? The current design keeps one source of truth. Confirm before Sprint 8.

Keep 'allocated' as a balance status (single source of truth), as designed.

Product owner

Before P1 S5



Open

1.6.1

Print connector selection (Zebra Browser Print vs. QZ Tray), pending the design-partner hardware survey.

Zebra Browser Print if all partners use Zebra; QZ Tray if any use other printer brands. Decide after the hardware survey.

Tech lead

Before P1 S6

Yes

Open

1.6.2

Is camera scanning (via a browser barcode library) needed as a fallback in Phase 1 (MVP)?

Not in the MVP; add as a fallback in Phase 2 if the hardware survey shows tablet-only stations.

Product owner

Before P1 S6



Open

1.6.3

Should manual typed entry require a supervisor PIN for regulated (lot/expiry) steps?

Yes, a supervisor PIN is required for manual entry on lot/expiry/serial steps.

Product owner

Before P1 S6



Open

1.7.1

Over-receipt tolerance default (proposal 5%) and whether over-receipts need supervisor approval.

5% tolerance; above that needs supervisor approval.

Product owner

Before P1 S7



Open

1.7.2

LPN/pallet labels on receipt: print a license plate label per pallet in Phase 1 (MVP)?

Yes, LPN labels per pallet in Phase 1 (needed for LPN tracking and floor storage).

Product owner

Before P1 S7



Open

1.8.1

Auto-allocate on 'ready' by default, or only at wave build time? (Wave-time allocation can give better lot choices; auto-allocation gives earlier stock visibility.)

Auto-allocate on 'ready' by default (earlier stock visibility), with a per-client option for wave-time allocation.

Tech lead

Before P1 S8



Open

1.8.2

Order edits after allocation: allow with automatic reallocation, or require cancel + recreate?

Allow edits with automatic deallocation/reallocation until the order is released to a wave; after release, cancel + recreate.

Product owner

Before P1 S8



Open

1.9.1

Maximum tasks claimed per picker at once (proposal 10, releasing idle claims after 5 minutes).

10 tasks per claim; idle claims released after 5 minutes.

Product owner

Before P1 S9



Open

1.9.2

Where inventory sits while picked but not packed: a tote container location (recommended) or an 'in-transit' virtual location?

Tote container location (inventory stays traceable in the tote/LPN).

Product owner

Before P1 S9



Open

1.10.1

Are pack-station weights mandatory in Phase 1 (MVP) (manual entry) given ShipStation needs weight for rates?

Yes, weight is mandatory at pack (manual entry in the MVP).

Product owner

Before P1 S10



Open

1.10.2

Order status 'shipped' at label creation or at carrier scan-out/manifest? (Affects channel fulfillment push timing in Sprint 12.)

'Shipped' at label creation (channel fulfillment pushed immediately), with an optional per-carrier 'shipped at manifest' setting.

Product owner

Before P1 S10



Open

1.11.1

Default count tolerance (proposal: 0 units for serial/high-value, 2% otherwise).

0 units for serial/high-value, 2% otherwise.

Product owner

Before P1 S11



Open

1.11.2

Should Phase 1 (MVP) include a 'full physical inventory' mode for design partners' opening counts at go-live?

Yes, a full physical inventory mode for opening counts at go-live and year-end.

Product owner

Before P1 S11

Yes

Open

1.11A.1

Do design partners' brands need anything else on day one that Extensiv's portal gives them today (validate in the Core Doc 12 interviews)?

Ask in every interview: 'What do your brands use in the Extensiv portal weekly?' Add must-haves to 11A scope if 3+ partners need them.

Product owner

Before P1 S11A

Yes

Open

1.11A.2

Should brands see warehouse location paths, or only quantities and statuses (default: hidden)?

Hidden by default. The 3PL can enable location paths per client.

Product owner

Before P1 S11A



Open

1.12.1

Auto-apply threshold for address corrections, and whether some clients want every correction reviewed.

Auto-apply at ≥95% provider confidence; below that, hold for review. Per-client 'review all' option.

Product owner

Before P1 S12



Open

1.12.2

Multi-location Shopify stores: map each Shopify location to a facility, or push the aggregate to one location?

Map each Shopify location to a facility.

Product owner

Before P1 S12



Open

1.13.1

Managed SFTP provider choice (e.g. AWS Transfer Family vs. a hosted SFTP service).

A hosted SFTP service to start (lower ops effort); AWS Transfer Family if volumes grow.

Tech lead

Before P1 S13



Open

1.13.2

Should design partners with their own ShipStation accounts use those accounts (BYO), or the platform's master account?

BYO ShipStation accounts (the partner keeps their negotiated rates and existing carrier setup).

Product owner

Before P1 S13

Yes

Open

1.14.1

Storage method default per design partner (month-end snapshot vs. average daily balance).

Mirror each partner's current contracts. Default: month-end snapshot.

Product owner

Before P1 S14

Yes

Open

1.14.2

Should the draft invoice PDF carry an invoice number in Phase 1 (MVP), or be clearly marked 'draft/statement' to avoid conflicting with the accounting system's numbering?

Mark it 'Statement / draft' with no invoice number; invoice numbering stays in the partner's accounting tool until Phase 2 invoicing.

Product owner

Before P1 S14



Open

1.15.1

Access to an Extensiv sandbox/test account for development: via a design partner's non-production account?

Yes. The design partner self-provisions a REST API credential in Extensiv's Support Portal (read roles + billing charges) and shares it with us under a written authorisation, for the Doc 12 test and later migration.

Product owner

Before P1 S15

Yes

Open

1.15.2

Which Extensiv billing configuration is retrievable via API vs. only via UI export?

Billing charges (transactions) are available via API. Rate-card/billing setup via API isn't confirmed, so plan for UI export + guided mapping and verify in the Doc 12 test.

Product owner

Before P1 S15



Open

1.16.1

Go/no-go authority: who signs off on Monday morning (3PL Owner + our implementation lead)?

3PL Owner + our implementation lead jointly, against the written go/no-go criteria.

Product owner

Before P1 S16



Open

1.16.2

How long is Extensiv kept read-only after cutover (proposal: 30 days) for lookups and disputes?

30 days read-only.

Product owner

Before P1 S16



Open

1.16.3

Chat tool selection and support staffing model for the first 20–25 design partners.

Plain or Intercom for in-app chat. 1 support engineer per ~8 live partners, with founder/engineer rota coverage during launch.

Tech lead

Before P1 S16

Yes

Open

3. Phase 2 — The Margin Engine

ID

Question

Recommended answer

Owner

Decide by

3PL input

Status

2.1.1

Anniversary billing on partial pallet release: prorate the remaining days, or bill the full 30-day cycle?

Prorate the remaining days on partial release (configurable per client).

Product owner

Before P2 S01



Open

2.1.2

Should linear-foot billing measure the actual footprint recorded at receiving, or a fixed footprint per location type?

Actual footprint recorded at receiving, falling back to the location-type default.

Product owner

Before P2 S01



Open

2.2.1

Pick matrix timing: price at pick confirmation (real-time) or at pack close (knows the final order shape)? The draft uses pack close.

Price at pack close (knows the final order shape).

Founder

Before P2 S02



Open

2.2.2

Should postage markup be visible to brand clients in the portal (Sprint 7), or hidden by default?

Hidden by default; the 3PL chooses per client.

Product owner

Before P2 S02



Open

2.3.1

Invoice detail level default: summary by category with a detailed appendix, or every charge as a line?

Summary by category on the invoice, with a detailed CSV/PDF appendix.

Product owner

Before P2 S03



Open

2.3.2

Tax: do any design partners need sales tax on services (state-dependent)? If so, a tax engine (e.g. Avalara/Stripe Tax) is needed.

Ask in interviews. Integrate Stripe Tax/Avalara only if 2+ partners need sales tax on services.

Founder + Legal

Before P2 S03

Yes

Open

2.4.1

Platform fee model: a fixed % on top of Stripe fees, passed to the 3PL, or absorbed into the subscription for higher tiers?

Transparent platform fee (e.g. 0.5% on top of Stripe fees) on Growth; waived or reduced on Scale.

Founder

Before P2 S04



Open

2.4.2

Who pays card fees: the 3PL, or a surcharge to the client (where legal)?

The 3PL's choice; default is the 3PL absorbs card fees and encourages ACH.

Founder

Before P2 S04



Open

2.4.3

Canadian design partners: is PAD (pre-authorized debit) needed at launch?

Only if a Canadian design partner signs; otherwise defer to Phase 4.

Product owner

Before P2 S04

Yes

Open

2.5.1

Default capture rule: every carton, or only multi-item/high-value orders (storage cost trade-off)?

Multi-item and high-value orders by default; 'every carton' as an option.

Product owner

Before P2 S05



Open

2.5.2

Is face blurring required for any design partner (workplace privacy rules)?

Not required in the US by default; provide camera-placement guidance and an optional blur flag.

Product owner

Before P2 S05

Yes

Open

2.6.1

Should brand users be able to create manual orders in the portal (for B2B/wholesale) in Phase 2, or only via channels/API?

Yes, simple manual/B2B order creation in the portal (with validation), because brands ask for it for wholesale.

Product owner

Before P2 S06



Open

2.6.2

Is the 'Powered by' footer on by default (a platform acquisition channel) or off?

On by default (small, tasteful); the 3PL can switch it off.

Product owner

Before P2 S06



Open

2.7.1

Dock appointment scheduling: a simple request in Phase 2, or a full slot calendar?

A simple appointment request in Phase 2; full slot calendar in Phase 4 (Sprint 6).

Product owner

Before P2 S07



Open

2.7.2

PDF packing-list extraction: build (document AI) or defer to CSV/XLSX-only for Phase 2?

CSV/XLSX in Phase 2; PDF extraction as a fast-follow using Claude document extraction with human confirmation.

Product owner

Before P2 S07



Open

2.8.1

Should brands be able to sync RMAs from returns apps (Loop, Returnly/AfterShip) in Phase 2? If yes, it goes in the Sprint 12/13 connector list.

Yes, add Loop and AfterShip Returns to the Sprint 13 connector list.

Product owner

Before P2 S08



Open

2.8.2

Default grading scale: A–D as proposed, or configurable per brand?

A–D default, configurable per brand.

Product owner

Before P2 S08



Open

2.9.1

Aggregator choice (EasyPost vs Shippo vs direct carrier APIs) and its per-label fee's effect on transparent pricing.

EasyPost or Shippo, chosen on negotiated per-label fees; show the fee transparently. Keep BYO carrier accounts.

Founder

Before P2 S09



Open

2.9.2

Should ShipStation remain as an optional provider for 3PLs who prefer it?

Yes, keep ShipStation as an optional provider.

Tech lead

Before P2 S09



Open

2.10.1

Which retailers' routing guides do design partners need first (label template priority)?

Walmart, Target, Costco first (confirm with Phase 2 partners).

Product owner

Before P2 S10

Yes

Open

2.10.2

Should mixed-SKU pallets be allowed by default, or configured per retailer?

Allowed by default, restricted per retailer template.

Product owner

Before P2 S10



Open

2.11.1

EDI provider: Stedi (API-first, lower cost) vs SPS Commerce (largest retailer network) vs supporting both?

Stedi first (API-first, lower cost); add SPS Commerce when a partner's retailer requires it.

Tech lead

Before P2 S11



Open

2.11.2

Who pays EDI provider fees: passed through to brands, or bundled?

Pass through to brands at cost.

Founder

Before P2 S11



Open

2.12.1

Connector priority: confirm wave 1 against design partners' actual channels (swap in Amazon Vendor/Target+/Wayfair if needed).

Confirm wave 1 against partners' actual channels; swap in Amazon Vendor/Target+/Wayfair where demanded.

Tech lead

Before P2 S12

Yes

Open

2.12.2

AI auto-accept: allowed at all, or always require one click?

One-click approval by default; auto-accept only above a very high confidence threshold, opt-in per client.

Product owner

Before P2 S12



Open

2.13.1

Final wave 2 list: confirm against sales pipeline demand (legacy carts vs international marketplaces).

Prioritise by sales-pipeline demand (legacy carts and marketplaces first, international later).

Product owner

Before P2 S13



Open

2.13.2

GraphQL writes (mutations) in Phase 2, or read-only until Phase 3?

Read-only GraphQL until Phase 3.

Product owner

Before P2 S13



Open

2.14.1

Kit lot rule: inherit the earliest component expiry (proposed) or assign a new kit lot with its own expiry?

Inherit the earliest component expiry.

Product owner

Before P2 S14



Open

2.14.2

Do regulated design partners need electronic signatures on overrides/quarantines in Phase 2?

Only if a regulated partner requires it; otherwise Phase 3.

Product owner

Before P2 S14

Yes

Open

2.15.1

Language priority beyond the five: which languages do design-partner workforces actually need?

Survey partner workforces; start with Spanish, then the top 2 languages found.

Product owner

Before P2 S15

Yes

Open

2.15.2

Compliance tool choice (Vanta vs Drata) and SOC 2 auditor selection.

Vanta or Drata (whichever gives the better startup deal); pick an auditor from its partner list.

Tech lead

Before P2 S15



Open

4. Phase 3 — Autonomous Operations & Network

ID

Question

Recommended answer

Owner

Decide by

3PL input

Status

3.1.1

Analytics store choice (ClickHouse vs BigQuery vs a DuckDB-based stack), balancing cost and ops burden.

Start with a managed, low-ops option (e.g. MotherDuck or BigQuery); move to ClickHouse only if cost or latency requires it.

Tech lead

Before P3 S01



Open

3.1.2

Do design partners allow their anonymised data to train cross-tenant models, or is every model per-tenant only?

Per-tenant models by default; cross-tenant anonymised training only with explicit opt-in in the contract.

Product owner

Before P3 S01

Yes

Open

3.2.1

Should routes account for congestion (several pickers in one aisle) in this sprint, or later?

Later (a Phase 3 stretch goal after baseline savings are proven).

Product owner

Before P3 S02



Open

3.2.2

Where does auto mode require supervisor opt-in (per wave) vs being on by default?

Auto mode is opt-in per facility (supervisor-enabled), with a kill switch.

Product owner

Before P3 S02



Open

3.3.1

Daily move budget default (labour hours) per facility.

Default 4 labour hours per day, configurable.

Product owner

Before P3 S03



Open

3.3.2

Should slotting be allowed to move a client's stock into another client's former zone (segregation policy)?

Only with the 3PL's segregation policy allowing it (default: not allowed).

Product owner

Before P3 S03



Open

3.4.1

Should cartonization choose between the 3PL's boxes and client-branded boxes by cost, or always honour client packaging rules?

Always honour client packaging rules; optimise cost within the allowed boxes.

Product owner

Before P3 S04



Open

3.4.2

Is a 3D placement visual worth the complexity on handhelds, or is a 2D layer hint enough?

A 2D layer hint first; 3D only if packers ask for it.

Product owner

Before P3 S04



Open

3.5.1

Should the system ever auto-move workers (auto mode), or always recommend only?

Recommend only; auto-move stays off (a human decides labour moves).

Product owner

Before P3 S05



Open

3.5.2

Worker productivity visibility: policy on whether individual metrics are shown to supervisors, given works council/union considerations in some regions.

Aggregate by default; individual metrics visible to supervisors only if the 3PL enables it.

Product owner

Before P3 S05



Open

3.6.1

Default search-time threshold per location type (bins vs pallet positions).

45s for bins, 90s for pallet positions (adaptive after 4 weeks of data).

Product owner

Before P3 S06



Open

3.6.2

Should worker-level shrinkage patterns be shown at all by default, or only on request by an Owner?

Only on request by an Owner, and audited.

Product owner

Before P3 S06



Open

3.7.1

Model selection and cost envelope per tier (e.g. a larger Claude model for complex analysis, a smaller one for SOP lookups).

A smaller/faster Claude model for SOP lookups and simple queries; a larger model for multi-step analysis. Cap usage per plan.

Founder

Before P3 S07



Open

3.7.2

Is the copilot available to brand users on all tiers, or a Scale-tier feature?

Staff on Growth+; brand users on Scale (or as an add-on).

Founder

Before P3 S07



Open

3.8.1

Default routing objective: lowest cost within SLA (proposed) vs fastest delivery?

Lowest cost within SLA.

Product owner

Before P3 S08



Open

3.8.2

Should transfer charges be billed to brands by default?

Configurable per client; default is billed at the 3PL's transfer rate.

Product owner

Before P3 S08



Open

3.9.1

Liability and insurance model between network partners: platform-standard terms, or fully negotiated per agreement?

Platform-standard terms with limited negotiable fields.

Founder + Legal

Before P3 S09



Open

3.9.2

May brands see which partner 3PL holds their stock (transparency), or is the node white-labelled behind the originating 3PL?

White-labelled behind the originating 3PL by default; transparency optional.

Product owner

Before P3 S09



Open

3.10.1

Network fee model: % of node charges, a per-order fee, or both?

Per-order routing fee plus a small % of node charges; validate with pilot partners.

Founder

Before P3 S10



Open

3.10.2

Settlement cadence and credit risk: should the platform require a deposit/credit limit for originating 3PLs?

Require a deposit or credit limit for new originating 3PLs; weekly settlement at first.

Product owner

Before P3 S10



Open

3.11.1

Should 3PLs not yet on the platform be listable (unverified) to seed supply, or verified platform users only?

Verified platform users only (protects trust and the retention moat).

Product owner

Before P3 S11



Open

3.11.2

Pricing ranges: required or optional on profiles?

Optional, but encouraged (profiles with pricing ranked on completeness).

Founder

Before P3 S11



Open

3.12.1

Marketplace fee model: fixed success fee per won brand, % of first-year billing, or free for Scale-tier 3PLs?

Success fee per won brand (fixed); free for Scale tier.

Founder

Before P3 S12



Open

3.12.2

How many 3PLs per RFP by default (3 vs 5), balancing brand choice and 3PL win rates?

3 by default, up to 5 for large RFPs.

Tech lead

Before P3 S12



Open

3.13.1

Should 3PLs see their brands' profitability (with consent) to advise them, or never?

Only with the brand's explicit consent.

Product owner

Before P3 S13



Open

3.13.2

Include ad spend (Meta/Google/Amazon Ads) in a later sprint for contribution margin?

Yes, a later sprint (Phase 3+), starting with Amazon Ads.

Product owner

Before P3 S13



Open

3.14.1

Should Amazon FBA inbound shipment creation be automated from the placement plan (SP-API Fulfillment Inbound)?

Yes, with approval (draft inbound shipment plans, human confirms).

Product owner

Before P3 S14



Open

3.14.2

Is forecasting a brand-paid portal add-on or included for 3PLs' clients?

Included on Scale; add-on for lower tiers.

Product owner

Before P3 S14



Open

3.15.1

Which second region first (EU vs Canada vs UK), based on the sales pipeline?

Follow the sales pipeline; likely Canada first (closest carriers/market), then UK.

Product owner

Before P3 S15



Open

3.15.2

Pricing: are AI modules included in Growth/Scale tiers or sold as add-ons (the master PRD leaves this open)?

Copilot included in Growth+; autonomous optimisation as an add-on priced against measured savings.

Founder

Before P3 S15



Open

5. Phase 4 — Horizon

ID

Question

Recommended answer

Owner

Decide by

3PL input

Status

4.1.1

Which automation vendors do target Scale-tier 3PLs already run (drives Sprint 2–5 priority)?

Survey Scale-tier customers and prospects before Phase 4 planning.

Founder

Before P4 S01



Open

4.1.2

Build the edge connector in-house or use an industrial IoT gateway product?

Start with an existing industrial IoT gateway; build in-house only if needed.

Tech lead

Before P4 S01



Open

4.2.1

Which light-module vendors to support first?

The vendor most used by existing customers (from the survey).

Tech lead

Before P4 S02



Open

4.2.2

Do we offer hardware bundles through partners, or integrate only?

Integrate only; refer hardware through partners.

Product owner

Before P4 S02



Open

4.3.1

Which AMR vendors first (e.g. Locus, Geek+, Zebra/Fetch, Brightpick), based on partner installs?

The one or two vendors already installed at customers.

Tech lead

Before P4 S03



Open

4.3.2

Commercial model with robot vendors (referral partnership vs integration only).

Integration partnership with referral fees; no reselling.

Founder

Before P4 S03



Open

4.4.1

Priority machine vendors (e.g. Packsize, Sealed Air, Sparck/CVP) based on target customers.

Packsize first (box-on-demand ties to cartonization); others on demand.

Tech lead

Before P4 S04

Yes

Open

4.4.2

Should the lane decision service always run at the edge for resilience?

Yes, edge-deployed for resilience.

Product owner

Before P4 S04



Open

4.5.1

Which dimensioner vendors first (e.g. Cubiscan, Mettler Toledo, Zebra)?

Cubiscan first (most common in 3PLs); others on demand.

Tech lead

Before P4 S05



Open

4.5.2

Do we pursue carrier adjustment recovery as a paid service (share of refunds)?

Yes, a paid service taking a share of recovered refunds.

Product owner

Before P4 S05



Open

4.6.1

Integrate with carrier visibility platforms (e.g. project44/FourKites) for ETAs in this sprint or later?

Later, if dock scheduling adoption proves demand.

Product owner

Before P4 S06



Open

4.7.1

Do target customers need bonded (customs) cross-dock support (a separate compliance scope)?

Not by default; scope separately if a customer requires it.

Product owner

Before P4 S07

Yes

Open

4.8.1

Do we need a certified industrial engineer partner to validate standards for customers who tie pay to them?

Yes, partner with a certified IE firm for customers tying pay to standards.

Product owner

Before P4 S08



Open

4.9.1

Which payroll/T&A systems do target 3PLs use most?

Survey customers. Likely UKG, ADP and Paycom first.

Product owner

Before P4 S09

Yes

Open

4.9.2

Legal review of incentive programs per state/country (wage and hour rules).

Yes, legal review per state/country before any incentive program launches.

Founder + Legal

Before P4 S09



Open

4.10.1

Launch-market order after this sprint: UK/EU first or Australia/Canada first?

Follow the pipeline; likely Canada/UK first.

Product owner

Before P4 S10



Open

4.10.2

Build tax rules in-house or use a tax engine (cost vs accuracy)?

Use a tax engine (accuracy over build cost).

Founder + Legal

Before P4 S10



Open

4.11.1

Duties/landed-cost provider choice (e.g. Zonos, Avalara Cross-Border).

Zonos or Avalara Cross-Border, based on price and API quality.

Tech lead

Before P4 S11



Open

4.11.2

Should the platform offer DDP duty payment as a service (fintech margin)?

Evaluate after launch; possible fintech margin.

Product owner

Before P4 S11



Open

4.12.1

Which market launches first, and with which design-partner 3PL?

The market with a signed design-partner 3PL.

Product owner

Before P4 S12

Yes

Open

4.12.2

Local support hours and language coverage per market.

Local business-hours support plus follow-the-sun escalation.

Product owner

Before P4 S12



Open

4.13.1

Which extension points matter most to early partners?

Order detail, SKU detail and portal dashboard slots first.

Product owner

Before P4 S13



Open

4.13.2

Allow apps on the floor workspace at all (performance/safety risk), or admin/portal only at first?

Admin/portal only at first; floor apps later with strict review.

Product owner

Before P4 S13



Open

4.14.1

Revenue share rate (e.g. 20% platform / 80% partner)?

20% platform / 80% partner.

Founder

Before P4 S14



Open

4.14.2

Which launch partners and apps seed the marketplace?

Recruit 5–10 launch partners (insurance, freight quoting, returns, analytics).

Founder

Before P4 S14



Open

4.15.1

Is 99.95% achievable on the current hosting stack, or does the premium tier require dedicated infrastructure?

Assess in Phase 4; likely needs dedicated/enterprise infrastructure for the premium tier.

Founder

Before P4 S15



Open

4.15.2

What's next after Phase 4 (e.g. Asia/LatAm market packs, TMS, freight network)?

Decide with the customer advisory board.

Product owner

Before P4 S15



Open



End of Document 14.

Core System Requirements  |  14 Decision Log  |  Page