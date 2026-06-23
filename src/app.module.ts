import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// ── Feature Modules (uncomment as you build them) ──────────────────────────
// import { OrganizationModule } from './organization/organization.module';
// import { GymModule } from './gym/gym.module';
// import { StaffModule } from './staff/staff.module';
// import { AuthModule } from './auth/auth.module';
// import { MembersModule } from './members/members.module';
// import { PlansModule } from './plans/plans.module';
// import { SubscriptionsModule } from './subscriptions/subscriptions.module';
// import { InvoicesModule } from './invoices/invoices.module';
// import { VatModule } from './vat/vat.module';
// import { SchedulingModule } from './scheduling/scheduling.module';
// import { BookingsModule } from './bookings/bookings.module';
// import { CommunicationModule } from './communication/communication.module';
// import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    // ── Config ───────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),

    // ── Cron / Scheduled Tasks ────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Database ──────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
