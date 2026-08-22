import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from '../communication/entities/notification-log.entity';
import { Member } from '../members/entities/member.entity';
import { MemberGymAccess } from '../members/entities/member-gym-access.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Gym } from '../gym/entities/gym.entity';
import { CommunicationModule } from '../communication/communication.module';
import { NotificationsService } from './notifications.service';
import { FirebaseService } from './firebase.service';
import { WebPushService } from './web-push.service';
import { NotificationsController, CommunicationController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, Member, MemberGymAccess, Booking, Gym]),
    CommunicationModule, // MailService — the email half of every notification
  ],
  controllers: [NotificationsController, CommunicationController],
  providers: [NotificationsService, FirebaseService, WebPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
