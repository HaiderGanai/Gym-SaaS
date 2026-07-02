import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffUser } from './entities/staff-user.entity';
import { StaffGymAccess } from './entities/staff-gym-access.entity';
import { Gym } from '../gym/entities/gym.entity';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StaffUser, StaffGymAccess, Gym]),
    CommunicationModule,
  ],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
