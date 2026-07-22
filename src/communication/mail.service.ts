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

  // daysLeft > 0 → grace-period reminder; daysLeft === 0 → expired notice
  async sendSubscriptionReminder(toEmail: string, orgName: string, daysLeft: number): Promise<void> {
    const expired = daysLeft <= 0;
    const subject = expired
      ? `${orgName}: subscription expired — dashboard access locked`
      : `${orgName}: payment needed — ${daysLeft} day${daysLeft === 1 ? '' : 's'} of grace left`;
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject,
        html: `
          <h2>${expired ? 'Subscription expired' : 'Subscription payment overdue'}</h2>
          <p>${expired
            ? `The subscription for <strong>${orgName}</strong> has expired and dashboard access is now locked.`
            : `We could not collect the renewal payment for <strong>${orgName}</strong>. You have <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> left before dashboard access is locked.`}</p>
          <p>Please update your payment method or renew from the billing page to ${expired ? 'restore' : 'keep'} access.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send subscription reminder to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send subscription reminder email');
    }
  }

  async sendInvoiceEmail(
    toEmail: string,
    name: string,
    invoice: {
      invoice_number: string; status: string; amount: number;
      net_amount: number; tax_amount: number; tax_rate: number;
      currency: string; created_at: Date;
    },
    gymName: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: `Invoice ${invoice.invoice_number} — ${gymName}`,
        html: `
          <h2>Hi ${name},</h2>
          <p>Here is your invoice from <strong>${gymName}</strong>.</p>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 16px 4px 0">Invoice</td><td><strong>${invoice.invoice_number}</strong></td></tr>
            <tr><td style="padding:4px 16px 4px 0">Date</td><td>${new Date(invoice.created_at).toDateString()}</td></tr>
            <tr><td style="padding:4px 16px 4px 0">Status</td><td>${invoice.status.toUpperCase()}</td></tr>
            <tr><td style="padding:4px 16px 4px 0">Net</td><td>${invoice.currency} ${Number(invoice.net_amount).toFixed(2)}</td></tr>
            <tr><td style="padding:4px 16px 4px 0">VAT (${Number(invoice.tax_rate)}%)</td><td>${invoice.currency} ${Number(invoice.tax_amount).toFixed(2)}</td></tr>
            <tr><td style="padding:4px 16px 4px 0"><strong>Total</strong></td><td><strong>${invoice.currency} ${Number(invoice.amount).toFixed(2)}</strong></td></tr>
          </table>
          <p>Questions? Reply to this email or ask at the front desk.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send invoice email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send invoice email');
    }
  }

  // sent to every confirmed/waitlisted member when staff disable a slot
  async sendSlotDisabled(
    toEmail: string,
    memberName: string,
    activityName: string,
    startsAt: Date,
    gymName: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: `Class cancelled: ${activityName} — ${gymName}`,
        html: `
          <h2>Hi ${memberName},</h2>
          <p>Unfortunately, the following class you were booked into has been cancelled:</p>
          <p style="padding:12px 16px;background:#fef2f2;border-radius:8px">
            <strong>${activityName}</strong><br/>
            ${new Date(startsAt).toUTCString()}<br/>
            ${gymName}
          </p>
          <p>We're sorry for the inconvenience — please check the app to book another session.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send slot-disabled email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send slot-disabled email');
    }
  }

  // sent when a cancellation frees a spot and the first waitlisted member gets it
  async sendWaitlistPromoted(
    toEmail: string,
    memberName: string,
    activityName: string,
    startsAt: Date,
    gymName: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: `You're in! A spot opened up in ${activityName}`,
        html: `
          <h2>Hi ${memberName},</h2>
          <p>Good news — a spot opened up and your waitlisted booking is now <strong>confirmed</strong>:</p>
          <p style="padding:12px 16px;background:#f0fdf4;border-radius:8px">
            <strong>${activityName}</strong><br/>
            ${new Date(startsAt).toUTCString()}<br/>
            ${gymName}
          </p>
          <p>Your check-in QR code is ready in the app. See you there!</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send waitlist promotion email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send waitlist promotion email');
    }
  }

  // sent X hours before a confirmed class (see NotificationsService cron)
  async sendBookingReminder(
    toEmail: string,
    memberName: string,
    activityName: string,
    startsAt: Date,
    gymName: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: `Reminder: ${activityName} is coming up`,
        html: `
          <h2>Hi ${memberName},</h2>
          <p>Just a reminder about your upcoming class:</p>
          <p style="padding:12px 16px;background:#eff6ff;border-radius:8px">
            <strong>${activityName}</strong><br/>
            ${new Date(startsAt).toUTCString()}<br/>
            ${gymName}
          </p>
          <p>See you there!</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send booking reminder email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send booking reminder email');
    }
  }

  // staff-composed broadcast to one/many/all members of a gym
  async sendAnnouncement(
    toEmail: string,
    memberName: string,
    gymName: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject: `${gymName}: ${title}`,
        html: `
          <h2>Hi ${memberName},</h2>
          <p style="padding:12px 16px;background:#f9fafb;border-radius:8px;white-space:pre-line">${body}</p>
          <p>— ${gymName}</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send announcement email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send announcement email');
    }
  }

  async sendOtp(toEmail: string, name: string, otp: string, purpose: 'reset' | 'change'): Promise<void> {
    const subject = purpose === 'reset' ? 'Your password reset OTP' : 'Your password change OTP';
    const action  = purpose === 'reset' ? 'reset your password' : 'change your password';
    try {
      await this.transporter.sendMail({
        from: `"Gym SaaS" <${this.config.get('EMAIL_USER')}>`,
        to: toEmail,
        subject,
        html: `
          <h2>Hi ${name},</h2>
          <p>Use the OTP below to ${action}. It expires in <strong>10 minutes</strong>.</p>
          <div style="
            display:inline-block;
            padding:16px 32px;
            background:#f3f4f6;
            border-radius:8px;
            font-size:32px;
            font-weight:700;
            letter-spacing:8px;
            color:#111827;
            margin:16px 0;
          ">${otp}</div>
          <p>If you did not request this, you can safely ignore this email.</p>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${toEmail}`, err);
      throw new InternalServerErrorException('Failed to send OTP email');
    }
  }
}
