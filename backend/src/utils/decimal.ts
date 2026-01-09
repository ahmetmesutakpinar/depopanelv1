import { Decimal } from '@prisma/client/runtime/library';

/**
 * Converts Prisma Decimal, number, string, null, or undefined to a JavaScript number
 * 
 * This is the standard utility for converting Decimal values throughout the application.
 * Use this instead of direct .toNumber() calls or Number() conversions.
 * 
 * @param value - The value to convert (Decimal, number, string, null, or undefined)
 * @returns A JavaScript number (defaults to 0 for null/undefined/invalid values)
 */
export function toNumber(value: number | Decimal | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  // Decimal instance
  try {
    return value.toNumber();
  } catch {
    return 0;
  }
}
