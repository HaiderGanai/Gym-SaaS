import {
  Injectable, NotFoundException, ForbiddenException,
  InternalServerErrorException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

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

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    user: StaffJwtPayload,
    logo?: Express.Multer.File,
  ): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (user.role !== StaffRole.SUPER_ADMIN && user.org_id !== id) {
      throw new ForbiddenException('Access denied');
    }
    const { accent, branding, ...rest } = dto;
    Object.assign(org, rest);
    // branding merges (partial updates don't wipe existing theme); accent lives inside it
    if (branding || accent) {
      org.branding = {
        ...(org.branding ?? {}),
        ...(branding ?? {}),
        ...(accent ? { accent } : {}),
      };
    }
    if (logo) {
      org.logo_url = await this.uploadLogo(logo);
      // keep the theme blob self-contained — frontend reads everything from branding
      org.branding = { ...(org.branding ?? {}), logo_url: org.logo_url };
    }
    return this.orgRepo.save(org);
  }

  private async uploadLogo(file: Express.Multer.File): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        { folder: 'gym-saas/org-logos' },
      );
      return result.secure_url;
    } catch (err) {
      this.logger.error('Cloudinary logo upload failed', err);
      throw new InternalServerErrorException('Logo upload failed');
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.orgRepo.remove(org);
    return { message: 'Organization deleted successfully' };
  }
}
