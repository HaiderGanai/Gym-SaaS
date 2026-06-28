import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './entities/notification-log.entity';
import { MailService } from './mail.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog])],
  providers: [MailService],
  exports: [MailService],
})
export class CommunicationModule {}
