import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from './entities/member.entity';
import { MemberGymAccess } from './entities/member-gym-access.entity';
import { Waiver } from './entities/waiver.entity';
import { Gym } from '../gym/entities/gym.entity';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, MemberGymAccess, Waiver, Gym]),
    CommunicationModule,
  ],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
