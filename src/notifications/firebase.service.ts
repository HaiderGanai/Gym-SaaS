import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, App, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';

// wraps Firebase Cloud Messaging. Boots best-effort: if no service account is
// configured/found, push is silently disabled rather than crashing the app —
// email + the in-app notification feed still work without it.
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const keyPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')
      // ponytail: hardcoded fallback to the testing key dropped in src/common/utils —
      // set FIREBASE_SERVICE_ACCOUNT_PATH in prod to point at the real credentials
      ?? path.join(process.cwd(), 'src/common/utils/farmsdrop-7b12e-firebase-adminsdk-fbsvc-0b388d95c0.json');

    if (!fs.existsSync(keyPath)) {
      this.logger.warn(`No Firebase service account at ${keyPath} — push notifications disabled`);
      return;
    }
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as ServiceAccount;
      this.app = initializeApp({ credential: cert(serviceAccount) });
    } catch (err) {
      this.logger.error('Failed to initialize Firebase — push notifications disabled', err as Error);
    }
  }

  // never throws — a bad token or missing config must not break the caller's flow
  async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<'sent' | 'failed' | 'token_invalid'> {
    if (!this.app) return 'failed';
    try {
      await getMessaging(this.app).send({
        token,
        notification: { title, body },
        data: data ? this.stringify(data) : undefined,
      });
      return 'sent';
    } catch (err) {
      const code = err instanceof Object && 'code' in err ? (err as { code: string }).code : undefined;
      if (code === 'messaging/registration-token-not-registered') return 'token_invalid';
      this.logger.error('Push send failed', err as Error);
      return 'failed';
    }
  }

  private stringify(data: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  }
}
