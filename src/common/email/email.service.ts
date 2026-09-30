import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.office365.com';
    const port = parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    });
  }

  async sendOtpEmail(to: string, otp: string, purpose: 'register' | 'login' = 'register') {
    const from = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER') || 'noreply@camtrack.com';
    const subject = purpose === 'register' ? 'Camtrack - Verify your account' : 'Camtrack - Login OTP';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a1a1a; text-align: center;">🛰️ Camtrack</h2>
        <h3 style="color: #333;">${purpose === 'register' ? 'Verify your email' : 'Login verification'}</h3>
        <p>Your OTP code is:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f5f5f5; padding: 12px 24px; border-radius: 8px; display: inline-block;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. Do not share it.</p>
        <p style="color: #666; font-size: 12px;">If you didn't request this, ignore this email.</p>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`OTP email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send OTP to ${to}`, err);
      // Do not throw - log and still return otp for dev (in case SMTP fails, allow flow via logs)
      // In production, you would throw
      this.logger.warn(`OTP for ${to} (email failed): ${otp}`);
      return null;
    }
  }

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
