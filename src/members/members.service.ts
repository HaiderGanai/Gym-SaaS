import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Member } from './entities/member.entity';
import { MemberGymAccess } from './entities/member-gym-access.entity';
import { RegisterMemberDto } from './dto/register-member.dto';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private memberRepo: Repository<Member>,
    @InjectRepository(MemberGymAccess)
    private accessRepo: Repository<MemberGymAccess>,
  ) {}

  findByEmail(email: string): Promise<Member | null> {
    return this.memberRepo.findOne({ where: { email } });
  }

  async getActiveGymAccess(
    memberId: string,
  ): Promise<{ gym_ids: string[]; primary_gym_id: string }> {
    const rows = await this.accessRepo.find({
      where: { member_id: memberId, is_active: true },
      select: { gym_id: true, is_primary: true },
    });
    const gym_ids = rows.map((r) => r.gym_id);
    const primaryRow = rows.find((r) => r.is_primary);
    return {
      gym_ids,
      primary_gym_id: primaryRow?.gym_id ?? gym_ids[0] ?? '',
    };
  }

  async register(dto: RegisterMemberDto): Promise<{ message: string; member_id: string }> {
    const existing = await this.memberRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const password_hash = await bcrypt.hash(dto.password, 12);

    const member = this.memberRepo.create({
      email: dto.email,
      full_name: dto.full_name,
      phone: dto.phone,
      password_hash,
    });

    const saved = await this.memberRepo.save(member);

    await this.accessRepo.save(
      this.accessRepo.create({
        member_id: saved.id,
        gym_id: dto.gym_id,
        is_primary: true,
        is_active: true,
      }),
    );

    return {
      message: 'Account created successfully. You can now log in.',
      member_id: saved.id,
    };
  }
}
