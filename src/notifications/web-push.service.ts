import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// wraps the `web-push` package (raw Web Push protocol / VAPID — no Firebase
// involved). Boots best-effort: if the VAPID keys aren't configured, web push
// is silently disabled rather than crashing the app — mirrors FirebaseService.
@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('VAPID keys not configured — web push disabled');
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.enabled = true;
  }

  getPublicKey(): string | undefined {
    return this.config.get<string>('VAPID_PUBLIC_KEY');
  }

  // never throws — a dead subscription or missing config must not break the caller's flow
  async send(
    subscription: WebPushSubscription,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<'sent' | 'failed' | 'subscription_invalid'> {
    if (!this.enabled) return 'failed';
    try {
      await webpush.sendNotification(
        subscription as webpush.PushSubscription,
        JSON.stringify({ title, body, data: data ?? {} }),
      );
      return 'sent';
    } catch (err) {
      const statusCode = err instanceof Object && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
      // 404/410 — the browser vendor's push service confirms this subscription is dead
      if (statusCode === 404 || statusCode === 410) return 'subscription_invalid';
      this.logger.error('Web push send failed', err as Error);
      return 'failed';
    }
  }
}
