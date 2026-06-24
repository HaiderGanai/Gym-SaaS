import { Module } from '@nestjs/common';
import { VatPeriodSummary } from './entities/vat-period-summary.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([VatPeriodSummary])],
})
export class VatModule {}
