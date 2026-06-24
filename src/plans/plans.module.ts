import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPlan } from './entities/membership-plan.entity';
import { Discount } from './entities/discount.entity';

@Module({
    imports: [TypeOrmModule.forFeature([MembershipPlan, Discount])],
})
export class PlansModule {}
