import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationModule } from 'src/communication/communication.module';
import { AiReport } from './entities/ai-report.entity';
import { OrgReport } from './entities/org-report.entity';

@Module({
    imports: [
    TypeOrmModule.forFeature([AiReport, OrgReport]),
    CommunicationModule,
  ],
})
export class ReportsModule {}
