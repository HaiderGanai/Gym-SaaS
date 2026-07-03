import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscriptionCheck';

// Exempts a route/controller from the SubscriptionInterceptor lock —
// used on billing + auth endpoints so a locked-out org can still pay/renew.
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);
