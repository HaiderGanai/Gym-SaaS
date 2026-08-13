**UX / PRODUCT DESIGN BRIEF**

**Gym Management SaaS**

**Web Admin Dashboard & Member Mobile App**

_A guide to user roles, information architecture, screen inventory, and functional flows_

Prepared for: UI/UX Design Team

Prepared by: InfinityBits - Product Team

Companion to: Gym Management SaaS - Feature Specification v1.0

Version 1.0

# Table of Contents

# 1\. Purpose of This Document

This brief translates the approved Feature Specification (v1.0) into design-ready guidance. It is meant to be read before wireframing begins, and referenced throughout the design process.

It covers three things the Feature Specification does not: who uses each product and why, how screens connect to one another, and what has to happen on each screen for the feature to work. It deliberately leaves visual style, layout, and component choice open - that is the designer's craft. What it fixes are the inputs, outputs, and states each screen must account for.

## 1.1 How to Use This Document

- Start with Section 2 (Products & User Roles) to understand who you're designing for.
- Section 3 (Information Architecture) gives you the navigation skeleton for both products - use it to plan your sitemap / screen list in Figma.
- Sections 4 and 5 are the core reference: one screen-by-screen breakdown for the Admin Dashboard, one for the Mobile App. Each entry lists the screen's purpose, what's on it, and the states it must handle (empty, loading, error, success).
- Section 6 walks through the 6 critical end-to-end user journeys - design these flows first, as they touch the most screens and de-risk the rest of the design.
- Section 7 lists cross-cutting UI patterns (notifications, empty states, permissions) that recur across many screens - define these once, reuse everywhere.
- Section 8 is a quick reference of open questions to confirm with the Product team before final hand-off.

# 2\. Products & User Roles

This system has two front-end products sharing one backend. Design them as a connected pair - actions taken in the Admin Dashboard (e.g., disabling a slot) must be reflected in near real time on the Mobile App.

## 2.1 Product Overview

| **Product**       | **Platform**                                        | **Primary Users**                      | **Core Job-to-be-Done**                                                         |
| ----------------- | --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Admin Dashboard   | Responsive Web App (desktop-first, tablet-friendly) | Gym Owners, Managers, Front Desk Staff | Run daily gym operations: members, bookings, payments, communication, reporting |
| Member Mobile App | Native - iOS & Android (React Native)               | Gym Members / Trainees                 | Discover & book classes, manage membership, pay, receive reminders              |

## 2.2 Admin Dashboard - User Roles & Permissions

Design the dashboard with role-based visibility in mind from the start - the same screens are reused across roles with different levels of access, rather than separate screens per role.

| **Role**   | **Access Scope**                                                                                                               | **Permission Level** |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Owner      | Full access: all members, billing, staff, reports, settings, multi-location (Phase 2+)                                         | Highest              |
| Manager    | Full operational access (members, bookings, reports, communication); limited access to billing settings and staff role changes | High                 |
| Front Desk | Check-in, member look-up, basic booking management, POS (Phase 3); no access to financial reports or settings                  | Medium               |

**Design implication:** Plan a visible role indicator (e.g., badge near the user avatar) and design at least one "restricted access" state - e.g., a greyed-out menu item with a tooltip such as "Ask your Owner for access" - so engineering has a pattern to apply across every gated screen.

## 2.3 Mobile App - User Type

Single user type for v1 (Member). The app should still account for two membership states that change what a member can do:

- Active Member - full booking and account access.
- Paused / Frozen Member - can view account and reactivate, but cannot book new classes until resumed.
- Expired / Past-Due Member - can view account and pay outstanding balance, but booking is blocked until payment clears.

# 3\. Information Architecture

Use the structures below as the starting sitemap for each product. Top-level items map to primary navigation (sidebar for web, tab bar for mobile).

## 3.1 Admin Dashboard - Navigation Structure

| **Nav Item**     | **Contains**                                                                    | **Visible To**                         |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Dashboard (Home) | Today's snapshot: bookings, revenue, check-ins, AI daily summary                | All roles                              |
| Members          | Member CRM, profiles, onboarding, waivers, pause/freeze                         | Owner, Manager, Front Desk             |
| Schedule         | Class/slot calendar, custom slot creation, enable/disable, recurring templates  | Owner, Manager                         |
| Bookings         | Live roster per slot, waitlists, check-in                                       | Owner, Manager, Front Desk             |
| Billing          | Plans, invoices, payments, VAT/tax settings, discounts, POS                     | Owner, Manager (view-only on settings) |
| Communication    | Email composer, push notification manager, templates                            | Owner, Manager                         |
| Reports          | Revenue, attendance, churn, AI daily report archive, exports                    | Owner, Manager                         |
| Staff            | Roles & permissions, staff scheduling                                           | Owner (Manager: view-only)             |
| Settings         | Gym profile, tax/VAT config, payment processor connections, locations (Phase 2) | Owner only                             |

## 3.2 Mobile App - Navigation Structure

Recommend a 4-5 item bottom tab bar. Suggested grouping:

| **Tab**     | **Contains**                                                          |
| ----------- | --------------------------------------------------------------------- |
| Home        | Membership status summary, upcoming booking, announcements feed       |
| Book        | Browse class/slot calendar, filter by day/type, book or join waitlist |
| My Bookings | Upcoming & past bookings, cancel/modify, QR check-in code             |
| Billing     | Invoices/receipts, payment method, plan details, pause/freeze request |
| Profile     | Personal info, notification preferences, support/FAQ                  |

**Design implication:** Surface the QR check-in code prominently (e.g., a persistent "View my check-in code" shortcut from Home), since it's used every visit and shouldn't be buried 2 taps deep in My Bookings.

# 4\. Admin Dashboard - Screen-by-Screen Specification

Each entry below is a design unit, not necessarily a single Figma frame - split into sub-screens or modals as needed. "States to design" lists the non-default conditions every screen should account for; treat this as a minimum checklist.

### 4.1 Login / Authentication

**Purpose:**

Secure entry point for all staff roles.

**Key elements:**

- Email + password login
- Forgot password flow
- Role-aware redirect after login (e.g., Front Desk lands on today's roster, Owner lands on Dashboard)

**States to design:**

- Invalid credentials error
- Account locked / too many attempts
- First-time login (force password reset)

### 4.2 Dashboard (Home)

**Purpose:**

Give the gym manager a one-glance read of "how is today going." This is the screen they open first, every day.

**Key elements:**

- AI Daily Summary card (auto-generated text: bookings, revenue, attendance, no-shows vs. yesterday/last week)
- Quick stats: today's bookings, check-ins so far, revenue today, active members
- Upcoming classes today (mini schedule strip)
- Alerts panel: failed payments, members at churn risk (AI-flagged), low-capacity classes
- Quick actions: add member, create announcement, view today's roster

**States to design:**

- First-day-of-use empty state (no data yet)
- AI summary still generating / not yet sent
- Multiple alerts requiring attention (prioritized list, not just a count)

### 4.3 Members - List View

**Purpose:**

Central member directory; the most frequently opened screen after Dashboard.

**Key elements:**

- Searchable, filterable table/list (status: active/paused/expired; plan type; join date)
- Bulk actions (e.g., select multiple → send email)
- "Add Member" entry point (manual add or via signup link)
- Status badges (Active / Paused / Past-Due / Cancelled)

**States to design:**

- Empty state (no members yet - first gym setup)
- No search results
- Bulk-action confirmation

### 4.4 Member Profile (Detail)

**Purpose:**

Single source of truth for one member - front desk and managers live here during check-in or support calls.

**Key elements:**

- Profile header: photo, name, status badge, plan, join date
- Tabs or sections: Overview, Bookings History, Payments/Invoices, Notes, Waiver/Documents
- Actions: edit profile, pause/freeze membership (with resume-date picker), cancel membership, resend waiver, manually log payment
- Attendance history visualization (helps front desk spot at-risk members)

**States to design:**

- Member with overdue payment (highlighted warning + "charge now" action)
- Paused member (show resume date + "reactivate now" override)
- Member with no booking history yet

### 4.5 Onboarding / Add New Member

**Purpose:**

Staff-led or self-service signup flow, ending in a signed digital waiver and an active plan.

**Key elements:**

- Step 1: Contact & personal info
- Step 2: Plan selection (monthly/weekly/yearly/pay-as-you-go/class pack)
- Step 3: Payment method capture (card or Direct Debit mandate for UK)
- Step 4: Digital waiver with e-signature
- Confirmation screen + automatic welcome email trigger

**States to design:**

- Payment method declined mid-flow
- Waiver not yet signed (incomplete onboarding - visible as a flagged status on Member List)
- Resuming a partially completed signup

### 4.6 Schedule - Calendar View

**Purpose:**

The operational heart of the product - where managers define what members are able to book. Design this with extra care; it's the most complex screen in the system.

**Key elements:**

- Calendar grid: day / week / month toggle
- Each slot shows: class/activity name, time, instructor, capacity (e.g., 8/12 booked), and an enabled/disabled toggle
- "Create Slot" action: choose one-off custom slot vs. recurring pattern (daily/weekly/monthly/yearly)
- Recurring Plan Templates: save a week's layout, apply to future date ranges
- Drag-to-reschedule or duplicate-slot shortcuts (recommended, not contractual)

**States to design:**

- Disabled slot (visually distinct from a fully booked slot - disabled ≠ full)
- Slot at capacity with an active waitlist (show waitlist count)
- Conflict warning when a new slot overlaps an existing one for the same instructor/room
- Editing a recurring slot - must clarify "this occurrence only" vs. "all future occurrences"

### 4.7 Slot Detail / Create-Edit Modal

**Purpose:**

Where the granular slot rules from the Feature Spec (Section 4.2) are actually configured.

**Key elements:**

- Fields: activity name, date/time, duration, capacity, instructor, room/location, booking window (how far in advance members can book), cancellation cut-off
- Enable/Disable toggle, clearly separated from Delete
- Roster preview (who's currently booked) if editing an existing slot

**States to design:**

- Attempting to disable a slot that already has bookings (require confirmation + explain members will be notified)
- Capacity reduced below current booking count (conflict warning)

### 4.8 Bookings / Live Roster

**Purpose:**

Day-of operational view - front desk uses this constantly during open hours.

**Key elements:**

- Select a slot → see roster: name, status (booked/checked-in/no-show/waitlisted)
- One-tap check-in (manual) alongside QR/auto check-in
- Manually move someone from waitlist to confirmed
- Mark no-show (feeds attendance reports & AI churn flagging)

**States to design:**

- Empty slot (no bookings yet)
- Fully booked + waitlist active
- Class already started / in progress visual cue

### 4.9 Billing - Plans & Pricing

**Purpose:**

Where Owners define what members can buy.

**Key elements:**

- Plan list (monthly/weekly/yearly/pay-as-you-go/class pack)
- Plan editor: price, billing frequency, included credits/classes, currency
- Discount / promo code creation
- Family/Group account linking (Phase 2)

**States to design:**

- Editing a plan that active members are already subscribed to (warn about impact)
- Archiving vs. deleting a plan

### 4.10 Billing - Invoices & Payments

**Purpose:**

Financial record-keeping and dispute resolution surface.

**Key elements:**

- Searchable invoice list (by member, date, status: paid/failed/refunded)
- Invoice detail: line items, VAT/tax breakdown (rate + amount + net/gross), payment method used
- Manual actions: resend invoice, issue refund, manually mark as paid
- Failed payment queue with retry status and dunning email history

**States to design:**

- VAT-registered (UK) vs. sales-tax (US) invoice layout - design both, since the line-item display differs
- Failed payment with multiple retry attempts (show retry timeline)

### 4.11 Billing - Settings (Tax, Currency, Payment Processors)

**Purpose:**

One-time / occasional setup screen - low frequency, high consequence. Prioritize clarity over density.

**Key elements:**

- VAT registration number entry (UK) / sales tax rate configuration (US, by state if applicable)
- Currency selection (GBP/USD)
- Stripe connection status; GoCardless connection status (UK Direct Debit)

**States to design:**

- Processor not yet connected (blocking state - explain why payments won't work)
- Processor connected but needs re-authentication

### 4.12 Communication - Email Composer

**Purpose:**

Lets staff message members without leaving the dashboard.

**Key elements:**

- Recipient picker: individual / segment (e.g., "paused members", "expiring this week") / all members
- Template library (welcome, renewal, win-back, payment receipt) + blank composer
- Send now vs. schedule for later
- Delivery status / open-rate summary (if available)

**States to design:**

- No recipients match selected segment
- Sending in progress (avoid duplicate sends if user double-clicks)

### 4.13 Communication - Push Notification Manager

**Purpose:**

Manual and automated push alerts to the mobile app.

**Key elements:**

- Manual push composer (announcement, urgent closure, etc.)
- View of automated push rules already active (e.g., booking reminders X hours before class) - read-only list with on/off toggle, not a full rule-builder in v1

**States to design:**

- Automated reminder toggled off (warn this affects no-show rates)

### 4.14 Reports - Overview

**Purpose:**

Where Owners/Managers go to understand trends, not just today's snapshot.

**Key elements:**

- Tabs: Revenue, Attendance & Utilization, Membership Growth & Churn
- Date range selector
- Export to CSV/Excel action
- AI Daily Report archive (past auto-generated summaries, searchable by date)

**States to design:**

- Insufficient data for a meaningful chart (new gym, < 1 week of data)
- Exporting a large dataset (show progress, not a frozen UI)

### 4.15 Staff - Roles & Scheduling

**Purpose:**

Owner-only screen (Manager has limited view) to manage who has access and when they work.

**Key elements:**

- Staff list with role badges
- Invite new staff member flow (email invite)
- Permission matrix view (what each role can/cannot do - useful as a reference panel)
- Staff shift/class assignment calendar

**States to design:**

- Pending invite (not yet accepted)
- Attempting to remove the last Owner account (should be blocked)

### 4.16 Settings - Gym Profile & General

**Purpose:**

Brand and operational basics.

**Key elements:**

- Gym name, logo, address, opening hours
- Multi-location toggle/list (Phase 2 - design as a future-friendly placeholder, not full multi-location UI yet)

**States to design:**

- Single-location gym (default, simplest state)

# 5\. Member Mobile App - Screen-by-Screen Specification

Design mobile-first for one-handed use. Most sessions will be short ("book a class," "check in," "check my next session") - minimize taps to the most common actions.

### 5.1 Onboarding / Sign Up

**Purpose:**

First-run experience for a new member, or login for a returning one.

**Key elements:**

- Sign up via invite link (sent by gym) or self-serve (if gym allows public signup)
- Login (email/password, consider social/biometric for v2)
- Plan selection + payment capture if self-serve
- Digital waiver e-signature (mobile-optimized - large signature pad area)

**States to design:**

- Invite link expired
- Payment failed during signup
- Waiver declined (block account activation, explain why)

### 5.2 Home

**Purpose:**

Landing screen - answer "what's my status and what's next" immediately.

**Key elements:**

- Membership status card (plan, renewal date, remaining credits if applicable)
- Next upcoming booking (prominent, with quick "View QR Code" action)
- Announcements / news feed from the gym
- Shortcut to "Book a class"

**States to design:**

- No upcoming bookings (prompt to book)
- Paused membership (explain why booking is disabled + reactivate CTA)
- Past-due payment (banner blocking booking until resolved, with a direct "pay now" action)

### 5.3 Book - Class/Slot Browser

**Purpose:**

Core conversion screen - must make finding and booking a slot effortless.

**Key elements:**

- Calendar/day selector (horizontal date strip is a common, effective pattern)
- List of available slots for selected day: time, activity, instructor, spots remaining
- Filter by activity type
- Tap a slot → confirm booking (or join waitlist if full)

**States to design:**

- Slot full - show "Join Waitlist" instead of "Book", and confirm waitlist position after joining
- Slot disabled by gym (should not appear, or appear clearly marked unavailable - confirm with Product which behavior is intended)
- No slots available that day
- Booking window not yet open / cancellation cut-off passed (explain why action is disabled)

### 5.4 My Bookings

**Purpose:**

Where members manage commitments they've already made.

**Key elements:**

- Upcoming bookings list (with cancel/modify actions, respecting cut-off windows)
- Past bookings / attendance history
- QR check-in code, accessible directly from an upcoming booking

**States to design:**

- Cancelling within the cut-off window (should be blocked, with a clear explanation)
- Waitlisted booking awaiting promotion
- Empty state - no bookings yet

### 5.5 Billing - Invoices & Payment Method

**Purpose:**

Self-service billing management to reduce front-desk support load.

**Key elements:**

- Current plan summary + next billing date/amount
- Invoice/receipt history (downloadable)
- Update payment method
- Request pause/freeze (with resume date) - submits to gym for approval or auto-applies per gym's configured rule

**States to design:**

- Payment method expired/declined (prominent banner, not just a buried list item)
- Pause request pending gym approval vs. auto-approved

### 5.6 Profile & Notification Preferences

**Purpose:**

Account management and communication opt-in/out.

**Key elements:**

- Personal info edit
- Notification preferences (push categories: reminders, announcements, promotions - allow granular opt-out per CAN-SPAM/PECR)
- Support / FAQ access
- Logout / delete account request

**States to design:**

- All notifications disabled (confirm member understands they'll miss booking reminders)

# 6\. Critical User Journeys

Design these end-to-end flows first. They cross multiple screens and will surface navigation or state-handling gaps early, before detailed screen design begins.

## 6.1 New Member Sign-Up (Admin-Assisted)

**Members List → Add Member → Plan Selection → Payment Capture → Waiver E-Sign → Confirmation + Welcome Email**

Design note: Front desk staff often run this while the prospective member is standing at the counter - keep each step short and avoid unnecessary scrolling on tablet-sized screens.

## 6.2 Member Books a Class (Mobile)

**Home → Book Tab → Select Day → Select Slot → Confirm Booking → Push Confirmation + Added to My Bookings**

Design note: If the slot is full, the flow branches to a Join Waitlist confirmation instead of step 5. If promoted later, a push notification should deep-link directly into My Bookings.

## 6.3 Manager Creates a Recurring Weekly Schedule

**Schedule → Create Slot → Set Recurrence (Weekly) → Set Capacity & Instructor → Save as Template (optional) → Schedule Published**

Design note: Clarify visually whether "Published" means members can immediately book, or whether there's a draft state. Confirm this with Product if not already defined.

## 6.4 Disabling a Slot With Existing Bookings

**Schedule → Select Slot → Toggle Disable → Confirmation Modal (shows affected bookings) → Notify Affected Members → Slot Marked Disabled**

Design note: This is a destructive-adjacent action - design a clear confirmation step that shows exactly who is affected before committing.

## 6.5 Failed Payment → Recovery

**Automated Charge Attempt → Payment Fails → Dunning Email Sent → Member Updates Card (Mobile or Email Link) → Retry Charge → Resolved or Escalated to Past-Due Status**

Design note: Design both sides of this - the member-facing "update payment method" screen (mobile) and the admin-facing failed-payment queue (dashboard) - as one connected flow, since they resolve the same event.

## 6.6 AI Daily Report Delivery

**Scheduled Job Runs (Early Morning) → Data Aggregated → AI Summary Generated → Emailed to Manager → Also Viewable in Reports → AI Report Archive**

Design note: This is the system's signature differentiator - design the email itself (not just the in-app archive view) with the same care as a core screen, since it's the first thing a manager sees about the product each day.

# 7\. Cross-Cutting UI Patterns

Define these patterns once as reusable components; they appear across many screens in both products.

| **Pattern**                  | **Notes**                                                                                                                                              | **Applies To**  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Status badges                | Active / Paused / Past-Due / Cancelled (members); Booked / Waitlisted / Checked-in / No-show (bookings); Enabled / Disabled (slots)                    | Both            |
| Empty states                 | Every list screen needs a designed empty state - not just a blank table. Most common: no members yet, no bookings yet, no classes today.               | Both            |
| Confirmation modals          | Required before: disabling a slot with bookings, cancelling a membership, issuing a refund, deleting a plan                                            | Admin Dashboard |
| Permission-gated UI          | Greyed-out or hidden nav items / actions based on role (see Section 2.2)                                                                               | Admin Dashboard |
| Push notification deep-links | Tapping a notification (booking reminder, waitlist promotion, payment failed) should open the relevant screen directly, not just the app home          | Mobile App      |
| Loading & sync states        | Schedule changes made on web should reflect on mobile promptly - design a subtle "updating" indicator rather than a silent stale state                 | Both            |
| Currency & tax display       | UK: VAT-inclusive pricing with VAT breakdown shown at invoice level. US: tax may be added at checkout depending on state. Design both invoice layouts. | Both            |

# 8\. Open Questions to Confirm Before Final Hand-Off

Flag these to the Product team - they affect specific screen states above and are worth resolving before high-fidelity design, not after.

- Schedule publishing: does creating a new recurring schedule go live immediately, or is there a draft/review step before members can see it? (Affects Section 6.3)
- Disabled slot visibility: should a disabled slot disappear entirely from the member's Book screen, or remain visible but unbookable? (Affects Section 5.3)
- Pause/freeze approval: is a member's pause/freeze request auto-approved, or does it require gym staff sign-off? (Affects Section 5.5)
- Family/Group accounts (Section 4.1 of the Feature Spec) - confirm whether this is in scope for initial design or safe to defer entirely to Phase 2/3 wireframes.
- Multi-location (Phase 2) - confirm whether Settings and Schedule screens need a location switcher placeholder now, to avoid a costly IA rework later.

_End of document._