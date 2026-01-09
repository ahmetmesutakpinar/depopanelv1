import { v4 as uuidv4 } from 'uuid';

/**
 * Benzersiz sipariş numarası oluşturur
 * Format: DP-YYYYMMDD-XXXX
 */
export function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  
  return `DP-${year}${month}${day}-${random}`;
}

/**
 * Benzersiz iade numarası oluşturur
 * Format: RT-YYYYMMDD-XXXX
 */
export function generateReturnNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  
  return `RT-${year}${month}${day}-${random}`;
}

/**
 * Slug oluşturur (Türkçe karakter desteği)
 */
export function slugify(text: string): string {
  const turkishChars: Record<string, string> = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
  };

  return text
    .split('')
    .map(char => turkishChars[char] || char)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pagination helper
 */
export function getPagination(page: number = 1, limit: number = 20) {
  const take = Math.min(Math.max(limit, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  
  return { skip, take };
}

/**
 * Pagination meta oluşturur
 */
export function getPaginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Tarih formatlar (TR)
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Para formatlar (TL)
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(num);
}

/**
 * UUID oluşturur
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Warehouse code oluşturur
 */
export function generateWarehouseCode(name: string): string {
  const slug = slugify(name).toUpperCase().replace(/-/g, '');
  const random = Math.floor(100 + Math.random() * 900);
  return `${slug.substring(0, 3)}${random}`;
}

/**
 * Objedeki boş değerleri temizler
 */
export function removeEmptyValues<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => 
      value !== null && value !== undefined && value !== ''
    )
  ) as Partial<T>;
}

/**
 * Sleep helper (async delay)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

