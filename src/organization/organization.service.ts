import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {}

  create(dto: CreateOrganizationDto): Promise<Organization> {
    const org = this.orgRepo.create({
      name: dto.name,
      logo_url: dto.logo_url,
      currency: dto.currency ?? 'GBP',
    });
    return this.orgRepo.save(org);
  }

  findAll(): Promise<Organization[]> {
    return this.orgRepo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string, user: StaffJwtPayload): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (user.role !== StaffRole.SUPER_ADMIN && user.org_id !== id) {
      throw new ForbiddenException('Access denied');
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, user: StaffJwtPayload): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (user.role !== StaffRole.SUPER_ADMIN && user.org_id !== id) {
      throw new ForbiddenException('Access denied');
    }
    Object.assign(org, dto);
    return this.orgRepo.save(org);
  }

  async remove(id: string): Promise<{ message: string }> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.orgRepo.remove(org);
    return { message: 'Organization deleted successfully' };
  }
}
