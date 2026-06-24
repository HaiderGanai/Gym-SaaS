import { Module } from '@nestjs/common';
import { Slot } from './entities/slot.entity';
import { SlotTemplate } from './entities/slot-template.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([SlotTemplate, Slot])],
})
export class ClassScheduleModule {}
