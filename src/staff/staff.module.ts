import { Module } from '@nestjs/common';
import { StaffGymAccess } from './entities/staff-gym-access.entity';
import { StaffUser } from './entities/staff-user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([StaffUser, StaffGymAccess])],
})
export class StaffModule {}
