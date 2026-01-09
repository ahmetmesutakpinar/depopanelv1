import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL gerekli'),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Frontend
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  
  // Rate Limit
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'), // 15 minutes
  RATE_LIMIT_MAX: z.string().default('100'),

  // Integrations (v3.1 hard reset)
  INTEGRATIONS_DISABLED: z.string().default('true'), // Set to 'false' to re-enable API integrations

  // SMTP (Optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Use console.error here because logger might not be initialized yet
  console.error('❌ Ortam değişkenleri hatası:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const env = {
  NODE_ENV: parsedEnv.data.NODE_ENV,
  PORT: parseInt(parsedEnv.data.PORT, 10),
  DATABASE_URL: parsedEnv.data.DATABASE_URL,
  JWT_SECRET: parsedEnv.data.JWT_SECRET,
  JWT_EXPIRES_IN: parsedEnv.data.JWT_EXPIRES_IN,
  FRONTEND_URL: parsedEnv.data.FRONTEND_URL,
  RATE_LIMIT_WINDOW_MS: parseInt(parsedEnv.data.RATE_LIMIT_WINDOW_MS, 10),
  RATE_LIMIT_MAX: parseInt(parsedEnv.data.RATE_LIMIT_MAX, 10),
  INTEGRATIONS_DISABLED: parsedEnv.data.INTEGRATIONS_DISABLED === 'true',
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  // SMTP
  SMTP_HOST: parsedEnv.data.SMTP_HOST,
  SMTP_PORT: parsedEnv.data.SMTP_PORT ? parseInt(parsedEnv.data.SMTP_PORT, 10) : 587,
  SMTP_SECURE: parsedEnv.data.SMTP_SECURE === 'true',
  SMTP_USER: parsedEnv.data.SMTP_USER,
  SMTP_PASS: parsedEnv.data.SMTP_PASS,
  SMTP_FROM: parsedEnv.data.SMTP_FROM,
};

