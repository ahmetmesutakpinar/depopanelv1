import { z } from 'zod';

/**
 * Güçlü şifre validation schema
 * - En az 8 karakter
 * - En az bir büyük harf
 * - En az bir küçük harf
 * - En az bir rakam
 * - En az bir özel karakter
 */
export const strongPasswordSchema = z.string()
  .min(8, 'Şifre en az 8 karakter olmalı')
  .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
  .regex(/[a-z]/, 'Şifre en az bir küçük harf içermeli')
  .regex(/[0-9]/, 'Şifre en az bir rakam içermeli')
  .regex(/[^A-Za-z0-9]/, 'Şifre en az bir özel karakter içermeli');

/**
 * Şifre gücünü kontrol et
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Şifre en az 8 karakter olmalı');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('En az bir büyük harf gerekli');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('En az bir küçük harf gerekli');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('En az bir rakam gerekli');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('En az bir özel karakter gerekli (!@#$%^&* vb.)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

