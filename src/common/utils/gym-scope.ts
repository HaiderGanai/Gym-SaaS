import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Gym } from '../../gym/entities/gym.entity';
import { StaffRole } from '../../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../interfaces/jwt-payload.interface';

// Which gym IDs the staff caller may see. null = unrestricted (super_admin).
export async function scopedGymIds(
  user: StaffJwtPayload,
  gymRepo: Repository<Gym>,
): Promise<string[] | null> {
  if (user.role === StaffRole.SUPER_ADMIN) return null;
  if (user.role === StaffRole.ORG_ADMIN) {
    const gyms = await gymRepo.find({
      where: { organization_id: user.org_id! },
      select: { id: true },
    });
    return gyms.map((g) => g.id);
  }
  return user.gym_ids; // gym_manager / front_desk
}

// Loads the gym and throws unless the staff caller can act on it.
export async function assertGymAccess(
  gymId: string,
  user: StaffJwtPayload,
  gymRepo: Repository<Gym>,
): Promise<Gym> {
  const gym = await gymRepo.findOne({ where: { id: gymId } });
  if (!gym) throw new NotFoundException('Gym not found');
  if (user.role === StaffRole.SUPER_ADMIN) return gym;
  if (user.role === StaffRole.ORG_ADMIN && user.org_id === gym.organization_id) return gym;
  if (user.gym_ids.includes(gymId)) return gym;
  throw new ForbiddenException('Access denied');
}
