import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VatPeriodSummary } from './entities/vat-period-summary.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Gym } from '../gym/entities/gym.entity';
import { VatService } from './vat.service';
import { VatController } from './vat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VatPeriodSummary, Invoice, Gym])],
  controllers: [VatController],
  providers: [VatService],
  exports: [VatService],
})
export class VatModule {}
