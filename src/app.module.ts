import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule as CronModule } from '@nestjs/schedule';
import { OrganizationModule } from './organization/organization.module';
import { GymModule } from './gym/gym.module';
import { StaffModule } from './staff/staff.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { InvoicesModule } from './invoices/invoices.module';
import { VatModule } from './vat/vat.module';
import { ClassScheduleModule } from './schedule/schedule.module';
import { BookingsModule } from './bookings/bookings.module';
import { CommunicationModule } from './communication/communication.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true, // no manual entity list ever again
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: false,
      }),
    }),
    CronModule.forRoot(),
    OrganizationModule,
    GymModule,
    StaffModule,
    AuthModule,
    MembersModule,
    PlansModule,
    SubscriptionsModule,
    InvoicesModule,
    VatModule,
    ClassScheduleModule,
    BookingsModule,
    CommunicationModule,
    ReportsModule,
  ],
})
export class AppModule {}