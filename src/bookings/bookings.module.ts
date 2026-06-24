import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationModule } from 'src/communication/communication.module';
import { Booking } from './entities/booking.entity';

@Module({
    imports: [
    TypeOrmModule.forFeature([Booking]),
    ScheduleModule,
    CommunicationModule,
  ],
})
export class BookingsModule {}
