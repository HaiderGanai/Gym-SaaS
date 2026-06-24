import { Module } from '@nestjs/common';
import { MemberSubscription } from './entities/member-subscription.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([MemberSubscription])],
})
export class SubscriptionsModule {}
