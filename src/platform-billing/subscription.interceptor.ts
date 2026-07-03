import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { Organization } from '../organization/entities/organization.entity';
import { SubscriptionStatus } from './entities/subscription-status.enum';
import { SKIP_SUBSCRIPTION_KEY } from '../common/decorators/skip-subscription.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

// Global gate: org staff of a pending/expired/cancelled org lose dashboard access.
// Registered as an interceptor (not a guard) so it runs AFTER the route-level
// JWT guards have populated request.user.
@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Organization) private orgRepo: Repository<Organization>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!skip) {
      const request = context.switchToHttp().getRequest();
      const user = request.user as StaffJwtPayload | undefined;
      // only org-affiliated staff are gated — members and super_admin pass through
      if (user && 'role' in user && user.role !== StaffRole.SUPER_ADMIN && user.org_id) {
        const org = await this.orgRepo.findOne({ where: { id: user.org_id } });
        if (org && ![SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE].includes(org.subscription_status)) {
          throw new ForbiddenException(
            'Your organization subscription is not active. Renew via POST /platform/billing/checkout to restore access.',
          );
        }
      }
    }
    return next.handle();
  }
}
