import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASS'),
      },
    });
  }

  async sendStaffInvite(
    toEmail: string,
    staffName: string,
    inviteToken: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const link = `${frontendUrl}/accept-invite?token=${inviteToken}`;

    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: 'You have been invited to join the team',
        html: `
          <h2>Welcome, ${staffName}!</h2>
          <p>You have been invited to join the gym management platform as a staff member.</p>
          <p>Click the link below to set your password and activate your account:</p>
          <a href="${link}" style="
            display:inline-block;
            padding:12px 24px;
            background:#1a56db;
            color:#fff;
            border-radius:6px;
            text-decoration:none;
            font-weight:600;
          ">Accept Invitation</a>
          <p>This link expires in <strong>72 hours</strong>.</p>
          <p>If you were not expecting this invitation, you can safely ignore this email.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send invite email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send invitation email');
    }
  }

  async sendMemberInvite(
    toEmail: string,
    memberName: string,
    inviteToken: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const link = `${frontendUrl}/member/accept-invite?token=${inviteToken}`;

    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: 'You have been invited to join the gym',
        html: `
          <h2>Welcome, ${memberName}!</h2>
          <p>You have been invited to become a member of our gym.</p>
          <p>Click the link below to set your password and activate your account:</p>
          <a href="${link}" style="
            display:inline-block;
            padding:12px 24px;
            background:#16a34a;
            color:#fff;
            border-radius:6px;
            text-decoration:none;
            font-weight:600;
          ">Activate My Account</a>
          <p>This link expires in <strong>72 hours</strong>.</p>
          <p>If you were not expecting this invitation, you can safely ignore this email.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send member invite email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send invitation email');
    }
  }
}
