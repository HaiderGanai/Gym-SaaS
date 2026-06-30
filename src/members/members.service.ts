import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Member } from './entities/member.entity';
import { MemberGymAccess } from './entities/member-gym-access.entity';
import { Waiver } from './entities/waiver.entity';
import { RegisterMemberDto } from './dto/register-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptMemberInviteDto } from './dto/accept-member-invite.dto';
import { SignWaiverDto } from './dto/sign-waiver.dto';
import { MailService } from '../communication/mail.service';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private memberRepo: Repository<Member>,
    @InjectRepository(MemberGymAccess)
    private accessRepo: Repository<MemberGymAccess>,
    @InjectRepository(Waiver)
    private waiverRepo: Repository<Waiver>,
    private mailService: MailService,
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

    return { message: 'Account created successfully. You can now log in.', member_id: saved.id };
  }

  async inviteMember(
    dto: InviteMemberDto,
    invitedByStaffId: string,
  ): Promise<{ message: string }> {
    const existing = await this.memberRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A member account with this email already exists');

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date();
    inviteExpiry.setHours(inviteExpiry.getHours() + 72);

    const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);

    const member = this.memberRepo.create({
      email: dto.email,
      full_name: dto.full_name,
      phone: dto.phone,
      password_hash: placeholderHash,
      invite_token: inviteToken,
      invite_expires_at: inviteExpiry,
    });
    const saved = await this.memberRepo.save(member);

    await this.accessRepo.save(
      this.accessRepo.create({
        member_id: saved.id,
        gym_id: dto.gym_id,
        is_primary: true,
        is_active: true,
        granted_by: invitedByStaffId,
      }),
    );

    await this.mailService.sendMemberInvite(dto.email, dto.full_name, inviteToken);

    return { message: `Invitation sent to ${dto.email}` };
  }

  async acceptMemberInvite(dto: AcceptMemberInviteDto): Promise<Member> {
    const member = await this.memberRepo.findOne({ where: { invite_token: dto.token } });
    if (!member) throw new NotFoundException('Invite token not found');
    if (!member.invite_expires_at || member.invite_expires_at < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }

    member.password_hash = await bcrypt.hash(dto.password, 12);
    member.invite_token = null!;
    member.invite_expires_at = null!;
    return this.memberRepo.save(member);
  }

  async signWaiver(
    memberId: string,
    dto: SignWaiverDto,
    ipAddress: string,
  ): Promise<{ message: string; waiver_id: string }> {
    const existing = await this.waiverRepo.findOne({
      where: { member_id: memberId, gym_id: dto.gym_id },
    });
    if (existing) throw new ConflictException('Waiver already signed for this gym');

    const waiver = this.waiverRepo.create({
      member_id: memberId,
      gym_id: dto.gym_id,
      signature_url: dto.signature_url,
      document_url: dto.document_url,
      ip_address: ipAddress,
      signed_at: new Date(),
    });
    const saved = await this.waiverRepo.save(waiver);

    return { message: 'Waiver signed successfully', waiver_id: saved.id };
  }
}
