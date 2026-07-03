// platform-billing/entities/subscription-status.enum.ts
// Shared by OrgSubscription.status and Organization.subscription_status
// (kept in its own file so organization.entity.ts can import it without a cycle)
export enum SubscriptionStatus {
  PENDING = 'pending',     // org created, never paid — dashboard locked
  ACTIVE = 'active',       // paid, full access
  GRACE = 'grace',         // renewal payment failed — 3-day grace, access kept, daily reminders
  EXPIRED = 'expired',     // grace lapsed unpaid — dashboard locked
  CANCELLED = 'cancelled', // org cancelled and period ended — dashboard locked
}
