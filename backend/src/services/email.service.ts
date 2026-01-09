import nodemailer from 'nodemailer';
import { env } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    // Only create transporter if SMTP settings are configured
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE || false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      logger.info('📧 E-posta servisi başlatıldı');
    } else {
      logger.warn('⚠️ SMTP ayarları yapılandırılmamış - e-posta gönderilemeyecek');
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      logger.warn('E-posta gönderilemedi: SMTP yapılandırılmamış');
      // Development modunda konsola yazdır
      if (env.NODE_ENV === 'development') {
        logger.info('📧 [DEV] E-posta içeriği:', {
          to: options.to,
          subject: options.subject,
        });
      }
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: env.SMTP_FROM || 'DepoPanel <noreply@depopanel.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      logger.info(`📧 E-posta gönderildi: ${options.to}`);
      return true;
    } catch (error) {
      logger.error('E-posta gönderme hatası:', error);
      return false;
    }
  }

  async sendVerificationCode(email: string, code: string, companyName: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .code { background: #f0f9ff; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
          .code span { font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 8px; }
          .info { color: #64748b; font-size: 14px; line-height: 1.6; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 DepoPanel</h1>
          </div>
          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0;">E-posta Doğrulama</h2>
            <p class="info">
              Merhaba,<br><br>
              <strong>${companyName}</strong> şirketi için kayıt işleminizi tamamlamak için aşağıdaki doğrulama kodunu kullanın:
            </p>
            <div class="code">
              <span>${code}</span>
            </div>
            <p class="info">
              Bu kod <strong>15 dakika</strong> içinde geçerliliğini yitirecektir.<br><br>
              Bu işlemi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
            </p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} DepoPanel - Tüm hakları saklıdır.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `${code} - DepoPanel Doğrulama Kodu`,
      html,
    });
  }

  async sendWelcomeEmail(email: string, firstName: string, companyName: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #22c55e, #16a34a); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .info { color: #64748b; font-size: 14px; line-height: 1.6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; margin: 20px 0; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Hoş Geldiniz!</h1>
          </div>
          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0;">Merhaba ${firstName}!</h2>
            <p class="info">
              <strong>${companyName}</strong> şirketiniz başarıyla kaydedildi ve hesabınız onay bekliyor.<br><br>
              Hesabınız onaylandığında size bildirim göndereceğiz. Onay süreci genellikle 24 saat içinde tamamlanır.
            </p>
            <p class="info">
              DepoPanel ile stoklarınızı, siparişlerinizi ve tüm pazaryeri entegrasyonlarınızı tek bir yerden yönetebilirsiniz.
            </p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} DepoPanel - Tüm hakları saklıdır.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'DepoPanel\'e Hoş Geldiniz! 🎉',
      html,
    });
  }

  async sendApprovalEmail(email: string, firstName: string, companyName: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #22c55e, #16a34a); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .info { color: #64748b; font-size: 14px; line-height: 1.6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; margin: 20px 0; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Hesabınız Onaylandı!</h1>
          </div>
          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0;">Tebrikler ${firstName}!</h2>
            <p class="info">
              <strong>${companyName}</strong> şirket hesabınız onaylandı. Artık DepoPanel'i kullanmaya başlayabilirsiniz!
            </p>
            <a href="${env.FRONTEND_URL}/login" class="button">Giriş Yap</a>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} DepoPanel - Tüm hakları saklıdır.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'DepoPanel Hesabınız Onaylandı! ✅',
      html,
    });
  }
}

export const emailService = new EmailService();

