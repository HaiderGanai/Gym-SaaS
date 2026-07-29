import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, ParseUUIDPipe,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller('organizations')
export class OrganizationController {
  constructor(private orgService: OrganizationService) {}

  @Post()
  @Roles(StaffRole.SUPER_ADMIN)
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgService.create(dto);
  }

  @Get()
  @Roles(StaffRole.SUPER_ADMIN)
  findAll() {
    return this.orgService.findAll();
  }

  // any staff of the org (org_admin, gym_manager, front_desk) — the service
  // scopes what comes back: full `gyms` for org_admin, own-branch(es) `branch`
  // for everyone else. super_admin bypasses @Roles entirely.
  @Get(':id')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER, StaffRole.FRONT_DESK)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.orgService.findOne(id, user);
  }

  // accepts JSON, or multipart/form-data with an optional 'logo' image file
  // (uploaded to Cloudinary → logo_url)
  @Patch(':id')
  @Roles(StaffRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('logo', {
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      file.mimetype.startsWith('image/')
        ? cb(null, true)
        : cb(new BadRequestException('logo must be an image file'), false),
  }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: StaffJwtPayload,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    return this.orgService.update(id, dto, user, logo);
  }

  @Delete(':id')
  @Roles(StaffRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.remove(id);
  }
}
