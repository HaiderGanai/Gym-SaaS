import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { Slot } from '../schedule/entities/slot.entity';
import { MemberSubscription } from '../subscriptions/entities/member-subscription.entity';
import { Member } from '../members/entities/member.entity';
import { Gym } from '../gym/entities/gym.entity';
import { BookingsController, CheckinController, EntryQrController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AuthModule } from '../auth/auth.module'; // exports JwtModule — QR signing
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Slot, MemberSubscription, Member, Gym]),
    AuthModule,
    CommunicationModule,
  ],
  controllers: [BookingsController, CheckinController, EntryQrController],
  providers: [BookingsService],
})
export class BookingsModule {}
