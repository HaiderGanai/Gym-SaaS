import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlotTemplate } from './entities/slot-template.entity';
import { Slot } from './entities/slot.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Gym } from '../gym/entities/gym.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlotTemplate, Slot, Booking, Gym, StaffUser]),
    NotificationsModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ClassScheduleModule {}
