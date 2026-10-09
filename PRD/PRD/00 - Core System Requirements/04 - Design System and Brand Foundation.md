Core System Requirements
Document 04 of 15 · Modern 3PL Warehouse Operating System (web application)
04. Design System & Brand Foundation
Item
Detail
Purpose
The brand foundation and the design system (tokens, typography, components, floor-mode rules, white-label theming, accessibility) that every web surface is built with.
Parent documents
PRD — Modern 3PL Warehouse Operating System (v1.1); Phase 1–4 sprint PRDs (PRD\Phase 1…4 folders)
Version / Date / Status
1.0 (Draft) · September 26, 2026 · Draft for review


1. Brand Foundation
Element
Definition
Product name
To be decided (open question in the master PRD). Working title: "Modern 3PL Warehouse Operating System". Run a trademark and domain check before choosing.
Positioning line
"The operating system for modern 3PLs": unified WMS + OMS + billing, real-time, easy to learn on the floor.
Brand promise
Every scan, stock level and invoice line is accurate and live. Learnable in 15 minutes. Priced with no surprises.
Personality
Precise · Calm under pressure · Plain-spoken · Modern industrial (not playful, not corporate-heavy).
Voice & tone
Short, direct instructions on the floor ('Scan bin A04-12-C-02'). Clear, specific errors that say what to do next. No jargon for brand users. Numbers and facts over adjectives.
Audiences
3PL owners/ops (trust, control), floor workers (clarity, speed, any language), brand clients (transparency, polish), developers (clarity, completeness).
Design reference
Rillet (rillet.com) is the preferred design reference for the product brand, the marketing site and the landing-page structure. Document 11 records the analysis. Tokens are adapted, not copied: use the design language, never Rillet's logo, copy, imagery or illustrations.
White-label rule
In the merchant portal the 3PL's brand leads (logo, colours, domain). The platform brand appears only in an optional 'Powered by' footer.

2. Colour Tokens
Adapted from the Rillet design reference (Document 11): a purple primary (also the primary button fill), deep violet-to-purple gradient sections, zinc neutrals and green for success. Machine-readable tokens are in brand-tokens/ (tokens.css, tailwind.brand.js, tokens.json).
2.1 Brand palette
Swatch
Token
Hex
Usage
 
purple-600 (brand primary)
#582EFD
Primary buttons, links, focus rings, key highlights
 
purple-500
#644EFF
Charts series 1, illustrations, active tab underline
 
purple-400
#766FFF
Secondary highlights on dark sections
 
purple-100
#DBDFFF
Selected rows, subtle fills
 
purple-50
#EBEEFF
Tinted section backgrounds, info banners
 
purple-800
#392498
Dark gradient end, dark cards
 
purple-900
#211452
Dark gradient start, document headers, footer
 
violet-800
#240257
Deep hero/CTA backgrounds (alternative gradient)
 
violet-200
#E1DCED
Soft borders on violet surfaces
 
black
#000000
Pure black (marketing type on light sections; not used for buttons)


2.2 Neutrals (zinc scale)
Swatch
Token
Hex
Usage
 
gray-900 (text primary)
#18181B
Body text, headings
 
gray-600
#52525B
Secondary text
 
gray-500
#71717A
Captions, placeholders
 
gray-300
#D4D4D8
Borders, secondary button outline
 
gray-200
#E4E4E7
Dividers, menu borders
 
gray-100
#F4F4F5
Surface backgrounds, table stripes
 
gray-50
#FAFAFA
Page background (app)
 
white
#FFFFFF
Cards, marketing page background


2.3 Semantic & floor-state colours
Swatch
Token
Hex
Usage
 
success-700
#1F996C
Correct scan flash, completed states, 'Shipped'
 
success-50
#EBF5EC
Success banners
 
warning-600
#CA8A04
Warnings (over-receipt, near cutoff), 'On hold'
 
danger-600
#DC2626
Wrong-scan lock, errors, destructive actions (added: the reference has no red)
 
success-text
#005133
Success TEXT on light backgrounds (green-900, ~9:1). success-700 is for fills/icons/large text only (3.6:1)
 
warning-text
#854D0E
Warning TEXT on light backgrounds (amber-800, ~7:1). warning-600 is for fills/icons only (2.9:1)
 
danger-text
#B91C1C
Danger TEXT on light backgrounds (red-700, ~6.5:1)
 
info-600
#582EFD
Informational banners (brand purple)
 
floor-bg
#18181B
Floor mode dark background
 
floor-text
#FAFAFA
Floor mode primary text


Gradients: dark sections use linear-gradient(180deg, #211452, #392498) (purple) or linear-gradient(180deg, #15052B, #240257) (violet). Light accent panels use linear-gradient(180deg, #DBDFFF, #EBEEFF). Soft glow for hero product shots: box-shadow: 0 3px 80px rgba(76,34,224,.2).
States never rely on colour alone: every state also has an icon, a label and (on the floor) a distinct sound. Text/background pairs must meet WCAG AA 4.5:1 (admin) and 7:1 for floor instructions.
3. Typography
Token
Font
Size / line height
Use
h1 (marketing)
Space Grotesk Medium
64 / 70, letter-spacing −1.25px
Hero headline
h2 (marketing)
Space Grotesk Medium
56 / 56, −0.75px
Section headlines
h3 / h4
Space Grotesk Medium
40 / 44 (−0.5px), 32 / 40
Sub-sections, feature titles
overline / eyebrow
DM Sans Bold, uppercase
16 / 20 (marketing), 12 / 16 (app)
Numbered section labels ('01 · PLATFORM')
display (app)
Space Grotesk Medium
30 / 36
App page titles
heading (app)
Space Grotesk Medium
20 / 28
App section headings
body
DM Sans Regular/Medium
16 / 24 (marketing, portal), 14 / 20 (admin)
Body text; lead paragraphs 18 / 24
caption
DM Sans Regular
12 / 14–16
Meta, table footers
mono
JetBrains Mono
13 / 18
SKU codes, location codes, IDs, API docs
floor-instruction
DM Sans Bold
28 / 34
Primary floor prompt ('Scan location')
floor-value
JetBrains Mono Bold
40–56
Location code and quantity on floor screens
floor-body
DM Sans Medium
20 / 28 (minimum)
Any other floor text

4. Spacing, Shape, Elevation & Motion
Spacing scale (px): 2, 4, 8, 12, 16, 24, 32, 48, 64. Page gutters 24 (desktop) / 16 (mobile).
Radius: 4 (chips), 6 (buttons, inputs, menus), 12 (cards, feature tiles), 16–20 (large panels, product screenshots), pill (badges, tags, announcement bar).
Elevation: mostly flat with 1px zinc borders. Cards/popovers use 0 24px 48px -12px rgba(17,17,20,.18). Product shots on dark sections use a purple glow.
Motion: 120–200ms ease-out for UI. Floor success flash 150ms. No decorative motion on the floor. Respect prefers-reduced-motion.
Touch targets: ≥44px admin/portal, ≥56px floor mode.
Icons: Lucide, 16/20/24px, 1.5px stroke (line icons, matching the reference's clean line style). Floor icons 32–48px.
Buttons: primary = purple-600 fill + white text, hover purple-700 (#4C22E0), in both light and dark mode. Secondary = transparent + zinc-300 border, hover purple-600 fill. On dark gradient sections (marketing), primary inverts to white fill + black text, hover purple-600, so it stays visible against purple. Link buttons are purple-600 text with an arrow (→).
Layout: max container widths 1210 / 1330 / 1440px, 56px desktop gutters, section spacing 120–160px (marketing), numbered eyebrow above every marketing section headline.
5. Component Library (packages/ui)
Group
Components
Foundations
Theme provider (tokens + white-label override), typography, icon, visually-hidden, focus ring
Inputs
Button (primary/secondary/ghost/destructive), input, textarea, select, combobox, date/range picker, checkbox, radio, switch, file upload + CSV mapper, search
Data display
Data table (virtualised, sortable, column config, bulk actions, CSV export), status badge, stat tile, timeline (event history), key-value list, empty state, skeleton
Feedback
Toast, banner, inline alert, confirm dialog, progress, error boundary page
Navigation
App shell (sidebar + org/facility switcher), tabs, breadcrumbs, command palette, pagination
Domain
Location card (full path Building › Wing › Area › Aisle › Bay › Level › Position, with level arrow; floor cell/lane variants), LPN chip, serial/unique-ID chip, lot & expiry badge (OK / near-expiry / expired colours), rotation badge (FIFO/FEFO/LIFO), 'Where is it?' result card and item timeline, product card (photo, code, UoM), order status timeline, hold reason chip, charge drill-down panel, cutoff countdown
Floor kit
Floor shell (worker, facility, connection status), task tile, scan prompt, big quantity keypad, full-screen feedback states (success/warning/error lock), exception sheet, aisle mini-map (Phase 3)
Charts
Line/area/bar with consistent series colours, sparkline, KPI tile (Recharts or Tremor)

6. Floor Mode Rules
One task per screen. The primary instruction is at the top, in floor-instruction size.
Scanning is the default input. Typing is a secondary, logged action.
Every scan gives feedback within 300ms: green flash + chime, amber + double beep, or red lock + buzzer that needs acknowledgement.
Show the product photo and location code on every pick/putaway step.
Minimum text 20px, targets ≥56px, usable with gloves and at arm's length. Dark theme by default, light theme option for bright docks.
Always show the connection status. Queued scans are shown as 'syncing', never lost.
All strings come from translation catalogs (multilingual in Phase 2).
7. White-Label Theming (Merchant Portal, Phase 2)
3PL-configurable tokens: logo, favicon, brand-primary, brand-accent, portal name, support contact, email sender name. Semantic colours (success/warning/danger) are not overridable, for accessibility and consistency.
Automatic contrast check on custom colours. If a colour fails AA, the system suggests the nearest accessible shade.
Custom domain and branded emails per 3PL.
8. Accessibility (Including Blind & Low-Vision Users) & Content Standards
Target: WCAG 2.2 Level AA on every web surface (admin, floor workspace, brand view/portal, marketing site), tested with real assistive technology. Accessibility requirements override brand choices when they conflict.
Area
Requirement
Screen readers
Every page usable with NVDA and JAWS (Windows), VoiceOver (macOS/iOS) and TalkBack (Android). Semantic HTML first, ARIA via Radix primitives, landmarks, headings, labelled controls, skip links.
Live updates
Realtime changes (order status, wave progress, alerts, scan results) announced through ARIA live regions (polite for updates, assertive for errors), without stealing focus.
Keyboard
All functions reachable by keyboard, logical focus order, visible focus ring (brand-600, 2px, ≥3:1), no keyboard traps, shortcuts documented and remappable.
Low vision
Text resizes to 200% and the layout reflows at 400% zoom (320 CSS px) without horizontal scrolling. Large-text mode (+25/50%) and a high-contrast theme. Respects OS forced-colours/high-contrast and prefers-contrast settings.
Colour & contrast
Text ≥4.5:1 (large text ≥3:1), UI components and focus ≥3:1, floor instructions ≥7:1. Status never shown by colour alone (icon + label + sound). Use the -text tokens for status text. Colour-blind-safe chart palette with patterns/labels.
Charts & data
Every chart has a data-table alternative and a text summary. Tables use proper headers and captions, with sortable columns announced.
Images & documents
Meaningful alt text for product images and photos. Generated PDFs (invoices, reports, packing slips) are tagged PDFs with reading order. Exports have header rows.
Forms & authentication
Labels and instructions on every field, errors announced and linked to fields, no time limits without extension. Accessible authentication (WCAG 2.2): password managers and paste allowed (including invite codes), non-puzzle bot checks (Turnstile invisible mode), email/magic-link alternatives.
Floor workspace
Spoken prompts option (text-to-speech in the worker's language) reading each step ('Go to Aisle 4, Bay 12, Level 3'), distinct audio + vibration for success/warning/error, screen-reader mode, large-text/high-contrast floor themes, all controls ≥56px.
Motion & timing
Respect prefers-reduced-motion. No flashing above 3 per second (the success flash is a single short colour change). Session time-outs warn and can be extended (floor idle lock excepted for security, with an audible warning).


Testing: automated axe checks in CI, manual screen-reader passes for every sprint touching UI, and usability sessions including blind/low-vision participants before launch and each phase release.
Public accessibility statement with a feedback contact at launch. VPAT/ACR from Phase 2 (buyers and public-sector customers ask for it).
Content: sentence case, verbs on buttons ('Release wave'), errors say what happened + what to do, US English at launch with i18n-ready catalogs.
A design-system Storybook documents every component with states, props and accessibility notes. Visual regression tests (Chromatic/Playwright snapshots) run in CI.
9. Design Deliverables for the MVP
Deliverable
Owner
Needed by
Brand name, logo, wordmark (after trademark check)
Founder + brand designer
Before design-partner outreach
Figma library mirroring these tokens and components
Product designer
Phase 1 · Sprint 1
Floor-mode prototypes tested with first-time users
Product designer
Before Phase 1 · Sprint 6
Storybook + tokens package
Frontend lead
Phase 1 · Sprint 1–2
Marketing site & pricing page (transparent pricing)
Marketing
Before MVP launch



End of Document 04.
