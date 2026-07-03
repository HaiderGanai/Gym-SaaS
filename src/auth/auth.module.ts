import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StaffJwtStrategy } from './strategies/staff-jwt.strategy';
import { MemberJwtStrategy } from './strategies/member-jwt.strategy';
import { StaffJwtGuard } from './guards/staff-jwt.guard';
import { MemberJwtGuard } from './guards/member-jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffModule } from '../staff/staff.module';
import { MembersModule } from '../members/members.module';
import { Organization } from '../organization/entities/organization.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET')!,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signOptions: { expiresIn: (config.get('JWT_EXPIRES_IN') ?? '7d') as any },
      }),
    }),
    StaffModule,
    MembersModule,
    TypeOrmModule.forFeature([Organization, StaffUser]), // org self-signup
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    StaffJwtStrategy,
    MemberJwtStrategy,
    StaffJwtGuard,
    MemberJwtGuard,
    RolesGuard,
  ],
  exports: [StaffJwtGuard, MemberJwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
