import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PlatformPlan } from './entities/platform-plan.entity';
import { OrgSubscription } from './entities/org-subscription.entity';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { Gym } from '../gym/entities/gym.entity';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformBillingController } from './platform-billing.controller';
import { SubscriptionInterceptor } from './subscription.interceptor';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformPlan, OrgSubscription, Organization, StaffUser, Gym]),
    CommunicationModule,
  ],
  controllers: [PlatformBillingController],
  providers: [
    PlatformBillingService,
    { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor },
  ],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
