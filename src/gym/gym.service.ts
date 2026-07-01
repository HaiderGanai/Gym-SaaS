import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class GymService {
  constructor(
    @InjectRepository(Gym)
    private gymRepo: Repository<Gym>,
  ) {}

  async create(dto: CreateGymDto, user: StaffJwtPayload): Promise<Gym> {
    let orgId: string;
    if (user.role === StaffRole.SUPER_ADMIN) {
      if (!dto.organization_id) {
        throw new ForbiddenException('Super admin must provide organization_id');
      }
      orgId = dto.organization_id;
    } else {
      orgId = user.org_id!;
    }

    const gym = this.gymRepo.create({
      organization_id: orgId,
      name: dto.name,
      address: dto.address,
      timezone: dto.timezone,
      tax_mode: dto.tax_mode,
      default_tax_rate: dto.default_tax_rate,
      tax_inclusive: dto.tax_inclusive,
      vat_number: dto.vat_number,
    });
    return this.gymRepo.save(gym);
  }

  findAll(user: StaffJwtPayload): Promise<Gym[]> {
    if (user.role === StaffRole.SUPER_ADMIN) {
      return this.gymRepo.find({ order: { created_at: 'DESC' } });
    }
    if (user.role === StaffRole.ORG_ADMIN) {
      return this.gymRepo.find({
        where: { organization_id: user.org_id! },
        order: { created_at: 'DESC' },
      });
    }
    if (!user.gym_ids.length) return Promise.resolve([]);
    return this.gymRepo.find({ where: { id: In(user.gym_ids) } });
  }

  async findOne(id: string, user: StaffJwtPayload): Promise<Gym> {
    const gym = await this.gymRepo.findOne({ where: { id } });
    if (!gym) throw new NotFoundException('Gym not found');
    this.assertAccess(gym, user);
    return gym;
  }

  async update(id: string, dto: UpdateGymDto, user: StaffJwtPayload): Promise<Gym> {
    const gym = await this.gymRepo.findOne({ where: { id } });
    if (!gym) throw new NotFoundException('Gym not found');
    this.assertAccess(gym, user);
    Object.assign(gym, dto);
    return this.gymRepo.save(gym);
  }

  async remove(id: string, user: StaffJwtPayload): Promise<{ message: string }> {
    const gym = await this.gymRepo.findOne({ where: { id } });
    if (!gym) throw new NotFoundException('Gym not found');
    if (user.role !== StaffRole.SUPER_ADMIN && user.org_id !== gym.organization_id) {
      throw new ForbiddenException('Access denied');
    }
    await this.gymRepo.remove(gym);
    return { message: 'Gym deleted successfully' };
  }

  private assertAccess(gym: Gym, user: StaffJwtPayload): void {
    if (user.role === StaffRole.SUPER_ADMIN) return;
    if (user.role === StaffRole.ORG_ADMIN && user.org_id === gym.organization_id) return;
    if (user.gym_ids.includes(gym.id)) return;
    throw new ForbiddenException('Access denied');
  }
}
