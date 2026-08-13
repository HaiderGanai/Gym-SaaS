import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { Slot } from '../schedule/entities/slot.entity';
import { MemberSubscription } from '../subscriptions/entities/member-subscription.entity';
import { Member } from '../members/entities/member.entity';
import { Gym } from '../gym/entities/gym.entity';
import { Attendance } from './entities/attendance.entity';
import { BookingsController, CheckinController, EntryQrController, GymQrController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AuthModule } from '../auth/auth.module'; // exports JwtModule — QR signing
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Slot, MemberSubscription, Member, Gym, Attendance]),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [BookingsController, CheckinController, EntryQrController, GymQrController],
  providers: [BookingsService],
})
export class BookingsModule {}
