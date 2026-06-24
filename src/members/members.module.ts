import { Module } from '@nestjs/common';
import { Waiver } from './entities/waiver.entity';
import { MemberGymAccess } from './entities/member-gym-access.entity';
import { Member } from './entities/member.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([Member, MemberGymAccess, Waiver])],
})
export class MembersModule {}
