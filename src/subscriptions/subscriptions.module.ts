import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberSubscription } from './entities/member-subscription.entity';
import { MembershipPlan } from '../plans/entities/membership-plan.entity';
import { Discount } from '../plans/entities/discount.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Member } from '../members/entities/member.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { Attendance } from '../bookings/entities/attendance.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberSubscription, MembershipPlan, Discount, Gym, Member, MemberGymAccess, Attendance,
    ]),
    InvoicesModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
