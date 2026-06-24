import { Module } from '@nestjs/common';
import { Organization } from './entities/organization.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([Organization])],
})
export class OrganizationModule {}
