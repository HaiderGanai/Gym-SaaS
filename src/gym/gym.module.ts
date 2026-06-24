import { Module } from '@nestjs/common';
import { Gym } from './entities/gym.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([Gym])],
})
export class GymModule {}
