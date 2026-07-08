import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPlan } from './entities/membership-plan.entity';
import { Discount } from './entities/discount.entity';
import { Gym } from '../gym/entities/gym.entity';
import { MemberSubscription } from '../subscriptions/entities/member-subscription.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipPlan, Discount, Gym, MemberSubscription])],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
