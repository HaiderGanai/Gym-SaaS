import { Module } from '@nestjs/common';
import { VatModule } from 'src/vat/vat.module';
import { Invoice } from './entities/invoice.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([Invoice]), VatModule],
})
export class InvoicesModule {}
