**GYM MANAGEMENT SaaS**

**Product Feature Specification &**

**Competitive Analysis Document**

Target Markets: United States & United Kingdom

_Benchmarked Against: PushPress · GymMaster · Glofox (ABC) · Mindbody_

Prepared for: InfinityBits - Product & Engineering Team

Document Type: Product Requirements Reference (PM-facing)

Version 1.0

# 1\. Executive Summary

This document outlines the recommended feature set for a Gym Management SaaS platform consisting of two components: an Admin Panel (web-based, for gym owners and managers) and a Member Mobile App (iOS/Android, for gym members to manage memberships and bookings).

The analysis is based on a review of four established players in the gym management software space - PushPress, GymMaster, Glofox (ABC Fitness), and Mindbody - with a focus on features that are considered table stakes for the US and UK markets, plus a set of differentiating AI-powered capabilities that can position this product competitively against incumbents.

The recommendations are organized into modules so they can be mapped directly to epics and sprints. A suggested phased roadmap (MVP, Phase 2, Phase 3) is included at the end of this document to help prioritize development effort.

# 2\. Competitive Landscape Snapshot

A quick comparison of the four reference platforms helps frame where the new SaaS product should position itself - combining the operational depth of GymMaster and Mindbody with the modern, founder-friendly usability of PushPress and Glofox.

| **Platform**         | **Primary Target Segment**                                              | **Standout Capability**                                                                                        | **Differentiator**                                          |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| PushPress            | Independent gyms, CrossFit, martial arts, boutique studios (US-focused) | Modern UX, transparent Stripe-based billing, free entry tier, AI assistant for ops & lead follow-up            | Modular add-ons (Core, Grow, Train), no long-term contracts |
| GymMaster            | Gyms & health clubs of all sizes, global (110+ countries)               | Built-in 24/7 door access control, automated billing, AI-enhanced retention marketing                          | Strong access-control hardware integration                  |
| Glofox (ABC Fitness) | Boutique studios, gyms, multi-location & franchise operators            | Fast check-in (barcode/kiosk), retention dashboards, churn alerts, scalable for franchises                     | Strong multi-location / franchise tooling                   |
| Mindbody             | Fitness, beauty & wellness - largest consumer marketplace               | 3M+ consumer marketplace app, AI messenger for lead response, deep reporting & multi-location enterprise tools | Marketplace-driven client acquisition                       |

**Positioning takeaway:**

The new product should lead with simplicity and transparent pricing (like PushPress/Glofox), while matching the operational depth (billing, VAT, reporting) of GymMaster and Mindbody - and use AI as a wedge feature for SME gyms that cannot afford a large admin team.

# 3\. Target Market Considerations - US & UK

Both markets share a strong appetite for self-service booking and mobile-first member experiences, but each has specific compliance and payment expectations that must be designed in from day one rather than retrofitted.

## 3.1 Payments & Tax

- UK: VAT-compliant invoicing is mandatory. Standard rate is 20% - invoices must show VAT registration number, VAT amount, and net/gross totals per line item.
- US: No VAT, but sales tax varies by state/county. The system should support a configurable tax-rate engine (flat % or zero-rated) so it can serve both markets from one codebase.
- Stripe is the de-facto payment processor for both markets (used by PushPress, Mindbody). GoCardless (UK/EU) is strongly preferred for recurring Direct Debit memberships in the UK due to lower failure rates than card payments.
- Support for recurring billing, failed-payment retries, and dunning emails - this is a top churn-reduction lever cited by all four competitors.

## 3.2 Compliance & Communication

- GDPR (UK/EU) and CCPA (US - California) compliance for member data: consent capture, data export, and right-to-erasure workflows.
- Digital waivers / liability forms with e-signature - standard requirement for gym onboarding in both markets.
- Email marketing must comply with CAN-SPAM (US) and PECR (UK) - i.e., unsubscribe links and consent records for promotional emails.

## 3.3 Member Experience Expectations

- Mobile-first booking - members expect to book, cancel, and join waitlists from a phone app, not a desktop browser.
- Real-time class/slot availability with automatic waitlist promotion when a spot opens up.
- Self-service account management: update payment method, pause/freeze membership, view invoices/receipts.

# 4\. Core Feature Set - Admin Panel (Web)

The Admin Panel is used by gym owners, managers, and front-desk staff to run daily operations. Features below are grouped by functional area.

## 4.1 Membership & Member Management

| **Feature**               | **Description**                                                                                  | **Priority** |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------ |
| Member CRM                | Centralized member profiles: contact info, membership status, payment history, attendance, notes | Must-Have    |
| Membership Plans          | Create unlimited plan types (monthly, weekly, yearly, pay-as-you-go, class packs)                | Must-Have    |
| Onboarding & Waivers      | Digital signup forms with e-signature liability waivers                                          | Must-Have    |
| Pause / Freeze Membership | Allow staff (or members) to pause billing for holidays/injury with auto-resume date              | Should-Have  |
| Family / Group Accounts   | Link multiple members under one billing account (common in US family gyms)                       | Could-Have   |

## 4.2 Booking, Scheduling & Slot Management

This is a core differentiator area per the project requirements - flexible plan creation and granular slot control.

| **Feature**               | **Description**                                                                                                       | **Priority** |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ |
| Class/Slot Calendar       | Visual calendar to create daily, weekly, monthly, or yearly recurring booking schedules                               | Must-Have    |
| Custom Slot Creation      | Define custom time slots (duration, capacity, instructor, location/room) outside of standard recurring patterns       | Must-Have    |
| Enable / Disable Slots    | Toggle individual slots on/off (e.g., holidays, maintenance, instructor unavailability) without deleting the schedule | Must-Have    |
| Capacity & Waitlist Rules | Set max capacity per slot; auto-promote from waitlist when a spot frees up                                            | Must-Have    |
| Booking Window Rules      | Configure how far in advance members can book, and cancellation cut-off windows                                       | Should-Have  |
| Recurring Plan Templates  | Save a weekly/monthly template and apply it across future periods in one click                                        | Should-Have  |
| Resource Booking          | Book shared resources (PT rooms, equipment, saunas) alongside classes                                                 | Could-Have   |

## 4.3 Payments, Billing & Invoicing

| **Feature**                       | **Description**                                                                                                                     | **Priority** |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Online Payment Processing         | Stripe (cards) integration; GoCardless for UK Direct Debit recurring payments                                                       | Must-Have    |
| Automated Recurring Billing       | Auto-charge members on their billing cycle; retry logic for failed payments                                                         | Must-Have    |
| VAT / Tax Calculation per Invoice | Configurable tax rate (e.g., 20% UK VAT or US state sales tax) applied per line item, shown on invoice with VAT registration number | Must-Have    |
| Invoice Generation & History      | Auto-generated PDF invoices/receipts emailed to members; searchable invoice history in admin panel                                  | Must-Have    |
| Point of Sale (POS)               | Sell retail items (supplements, merchandise) and one-off services (PT sessions, day passes)                                         | Should-Have  |
| Discounts & Promo Codes           | Create % or fixed-amount discounts, referral codes, and family/corporate plans                                                      | Should-Have  |
| Multi-Currency Support            | Display and bill in GBP or USD depending on gym location                                                                            | Should-Have  |

## 4.4 Communication Suite

| **Feature**                 | **Description**                                                                                                           | **Priority** |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| In-App Email Composer       | Send one-off or templated emails to individual members, segments, or all registered members directly from the admin panel | Must-Have    |
| Push Notification Manager   | Send push alerts to the mobile app (booking reminders, announcements, payment alerts)                                     | Must-Have    |
| Automated Booking Reminders | Auto-send push/email reminders X hours before a member's booked slot                                                      | Must-Have    |
| SMS Notifications           | Optional SMS for booking reminders and payment failures (common in UK/US gyms)                                            | Could-Have   |
| Email Templates Library     | Pre-built templates: welcome email, payment receipt, membership renewal, win-back                                         | Should-Have  |

## 4.5 Staff & Access Management

| **Feature**                    | **Description**                                                                               | **Priority**         |
| ------------------------------ | --------------------------------------------------------------------------------------------- | -------------------- |
| Role-Based Access Control      | Owner, Manager, Front Desk, Trainer roles with permission scoping                             | Must-Have            |
| Staff Scheduling               | Assign trainers/staff to classes and shifts                                                   | Should-Have          |
| Check-In / Attendance Tracking | QR code or manual check-in at front desk; attendance history per member                       | Must-Have            |
| Multi-Location Support         | Manage multiple gym branches from one admin account with shared or location-specific settings | Could-Have (Phase 2) |

# 5\. Core Feature Set - Member Mobile App

| **Feature**                           | **Description**                                                                  | **Priority**         |
| ------------------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| Account & Membership Dashboard        | View membership plan, status, renewal date, and remaining class credits          | Must-Have            |
| Class / Slot Booking                  | Browse available daily/weekly slots and book in real time; join waitlist if full | Must-Have            |
| Booking Management                    | View, modify, or cancel upcoming bookings within allowed windows                 | Must-Have            |
| Push Notifications                    | Receive reminders for upcoming bookings, cancellations, and gym announcements    | Must-Have            |
| Online Payments & Billing             | View invoices/receipts, update payment method, view billing history              | Must-Have            |
| Digital Membership Card / QR Check-In | QR code for fast check-in at the gym entrance/front desk                         | Should-Have          |
| Profile & Preferences                 | Manage personal info, communication preferences, and notification settings       | Must-Have            |
| Workout Tracking (Optional Add-on)    | Log workouts, track progress, view programs assigned by trainers                 | Could-Have (Phase 3) |
| In-App Messaging / Announcements Feed | Receive and view broadcast messages/news from the gym                            | Should-Have          |

# 6\. AI-Powered Features (Key Differentiator)

AI is the primary opportunity to differentiate this product from incumbents - particularly for SME gyms in the US/UK that lack dedicated marketing or admin staff. The features below map directly to the requirements provided and to AI capabilities already validated by PushPress, GymMaster, and Mindbody.

| **AI Feature**                     | **Description**                                                                                                                                   | **Surface** | **Priority**         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------- |
| Automated Daily Report Generation  | AI compiles a daily summary (bookings, revenue, attendance, cancellations, no-shows) and emails it to the gym manager automatically every morning | Admin Panel | Must-Have            |
| AI Member Communication Assistant  | Drafts personalized re-engagement, renewal reminder, or win-back emails based on member activity/inactivity patterns                              | Admin Panel | Should-Have          |
| Smart Booking Recommendations      | Suggests optimal class times to members based on their booking history and gym capacity trends                                                    | Mobile App  | Could-Have           |
| No-Show & Churn Prediction         | Flags members at risk of cancelling membership based on declining attendance, surfaced to managers in the daily report                            | Admin Panel | Should-Have          |
| AI Chat Support / FAQ Bot          | In-app assistant answering common member questions (hours, plans, booking help), reducing front-desk load                                         | Mobile App  | Could-Have (Phase 3) |
| Natural-Language Reporting Queries | Manager can ask questions like "How many members joined this month?" and get an instant AI-generated answer                                       | Admin Panel | Could-Have (Phase 3) |

**Implementation note:**

The daily report generation and email delivery should be built first as it directly addresses a stated requirement and provides immediate, visible value to gym managers with minimal AI complexity (primarily data aggregation + LLM summarization + scheduled email job).

# 7\. Reporting & Analytics

| **Feature**                      | **Description**                                                                             | **Priority** |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| Revenue Reports                  | Daily/weekly/monthly revenue, broken down by plan type and payment method                   | Must-Have    |
| Attendance & Utilization Reports | Class fill rates, peak hours, no-show rates - supports slot planning decisions              | Must-Have    |
| Membership Growth & Churn        | New signups, cancellations, churn rate trends over time                                     | Must-Have    |
| Automated Email Reports          | Scheduled (daily/weekly) report delivery to manager's email - AI-summarized (see Section 6) | Must-Have    |
| Exportable Data                  | CSV/Excel export of members, transactions, and bookings for accounting                      | Should-Have  |

# 8\. Recommended Build Phases

Given the scope, a phased rollout reduces time-to-market while validating the core value proposition early.

| **Phase**     | **Scope**                                                                                                                                                                                                                               | **Indicative Timeline** |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| MVP (Phase 1) | Member CRM & plans · Booking calendar with custom slots & enable/disable · Online payments (Stripe) with VAT/tax per invoice · In-app email to members · Push notification reminders · Basic revenue & attendance reports · QR check-in | 1-2 weeks               |
| Phase 2       | AI daily report generation & email delivery · Discounts/promo codes · Pause/freeze membership · GoCardless (UK Direct Debit) · Churn-risk flagging · Multi-currency                                                                     | 2-3 weeks               |
| Phase 3       | Multi-location support · POS for retail/PT sessions · Workout tracking · AI chat support · Natural-language reporting · SMS notifications                                                                                               | 3-4 weeks               |

# 9\. Suggested Technology Stack

Aligned with InfinityBits' existing engineering capabilities for fast delivery and AI integration.

| **Layer**         | **Recommendation**                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Admin Panel (Web) | React.js / Next.js                                                                                |
| Mobile App        | React Native (iOS & Android)                                                                      |
| Backend / API     | Node.js (Express or NestJS)                                                                       |
| Database          | PostgreSQL (relational data: memberships, bookings, invoices)                                     |
| Payments          | Stripe (cards, US/UK) + GoCardless (UK Direct Debit)                                              |
| Notifications     | Firebase Cloud Messaging (push) + SendGrid/Postmark (email) + Twilio (SMS, Phase 3)               |
| AI / LLM Layer    | OpenAI API for report summarization, communication drafting, and chat assistant                   |
| Hosting / Infra   | AWS or DigitalOcean, with CI/CD pipeline and automated daily report job (cron / scheduled Lambda) |

# 10\. Summary & Next Steps

This specification combines the proven, must-have functionality of established gym management platforms with a focused set of AI-driven features that address real pain points for US/UK gym owners - particularly around daily operational visibility (automated reports), member communication, and flexible scheduling.

Recommended next steps:

- Validate the MVP feature list (Section 8) with 2-3 target gym owners in the US/UK before finalizing scope.
- Translate Sections 4-6 into epics and user stories for sprint planning.
- Confirm payment processor accounts (Stripe, GoCardless) and tax configuration requirements per target country.
- Define the data model for bookings/slots early, as it underpins scheduling, AI reporting, and notifications.