import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { env } from '../config/env';
import { maskPhone } from '../common/util';

/** Provider-agnostic SMS. Swap providers via SMS_PROVIDER without touching auth code. */
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
  send(phone: string, text: string): Promise<void>;
}

class ConsoleSms implements SmsProvider {
  private log = new Logger('SMS');
  async sendOtp(phone: string, code: string) {
    this.log.log(`[dev] OTP for ${maskPhone(phone)}: ${code}`);
  }
  async send(phone: string, text: string) {
    this.log.log(`[dev] SMS to ${maskPhone(phone)}: ${text}`);
  }
}

class Msg91Sms implements SmsProvider {
  private log = new Logger('MSG91');
  async sendOtp(phone: string, code: string) {
    const e = env();
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: e.MSG91_AUTH_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: e.MSG91_TEMPLATE_ID, recipients: [{ mobiles: `91${phone}`, otp: code }] }),
    });
    if (!res.ok) {
      this.log.error(`OTP send failed (${res.status}) for ${maskPhone(phone)}`);
      throw new Error('SMS provider error');
    }
  }
  async send(phone: string, text: string) {
    // Transactional templates must be DLT-registered in India; wire each template id here when approved.
    this.log.warn(`Transactional SMS template not configured; skipped message to ${maskPhone(phone)} (${text.length} chars)`);
  }
}

@Injectable()
export class SmsService implements SmsProvider {
  private provider: SmsProvider = env().SMS_PROVIDER === 'msg91' ? new Msg91Sms() : new ConsoleSms();
  sendOtp(phone: string, code: string) {
    return this.provider.sendOtp(phone, code);
  }
  send(phone: string, text: string) {
    return this.provider.send(phone, text);
  }
}

@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
