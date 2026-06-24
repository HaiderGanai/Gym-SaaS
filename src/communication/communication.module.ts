import { Module } from '@nestjs/common';
import { NotificationLog } from './entities/notification-log.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([NotificationLog])],

})
export class CommunicationModule {}
