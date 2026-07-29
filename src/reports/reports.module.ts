import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationModule } from '../communication/communication.module';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Slot } from '../schedule/entities/slot.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { MemberSubscription } from '../subscriptions/entities/member-subscription.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      Booking,
      Slot,
      MemberGymAccess,
      MemberSubscription,
      Gym,
      Organization,
      StaffUser,
    ]),
    CommunicationModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
