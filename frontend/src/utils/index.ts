import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency (TL)
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(num);
}

/**
 * Format number
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('tr-TR').format(num);
}

/**
 * Format date (TR)
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format datetime (TR)
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Az önce';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} dakika önce`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} saat önce`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} gün önce`;
  return formatDate(date);
}

/**
 * Truncate text
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get order status label
 */
export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    // Genel durumlar
    PENDING: 'Hazırlanıyor',
    PROCESSING: 'Paketlendi',
    SHIPPED: 'Kargoya Verildi',
    DELIVERED: 'Teslim Edildi',
    CANCELLED: 'İptal Edildi',
    RETURNED: 'İade Edildi',
    NEW: 'Yeni',
    PAID: 'Ödendi',
    READY_TO_PICK: 'Toplanmaya Hazır',
    PICKED: 'Toplandı',
    PACKED: 'Paketlendi',
    PENDING_RESOLUTION: 'Çözüm Bekliyor',
    // WooCommerce durumları
    WC_PENDING: 'Ödeme Bekleniyor',
    WC_PROCESSING: 'Hazırlanıyor',
    WC_ON_HOLD: 'Beklemede',
    WC_COMPLETED: 'Tamamlandı',
    WC_CANCELLED: 'İptal Edildi',
    WC_REFUNDED: 'İade Edildi',
    WC_FAILED: 'Başarısız',
    WC_SHIPPED: 'Kargoya Verildi',
    WC_DELIVERED: 'Teslim Edildi',
    WC_TRASH: 'Silinmiş',
  };
  return labels[status] || status;
}

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Genel durumlar
    PENDING: 'warning',
    PROCESSING: 'primary',
    SHIPPED: 'primary',
    DELIVERED: 'success',
    CANCELLED: 'danger',
    RETURNED: 'secondary',
    NEW: 'warning',
    PAID: 'primary',
    READY_TO_PICK: 'warning',
    PICKED: 'primary',
    PACKED: 'primary',
    PENDING_RESOLUTION: 'warning',
    // WooCommerce durumları
    WC_PENDING: 'warning',        // Ödeme bekleniyor - sarı/turuncu
    WC_PROCESSING: 'primary',     // Hazırlanıyor - mavi
    WC_ON_HOLD: 'warning',        // Beklemede - sarı/turuncu
    WC_COMPLETED: 'success',      // Tamamlandı - yeşil
    WC_CANCELLED: 'danger',       // İptal edildi - kırmızı
    WC_REFUNDED: 'secondary',     // İade edildi - gri
    WC_FAILED: 'danger',          // Başarısız - kırmızı
    WC_SHIPPED: 'primary',        // Kargoya verildi - mavi
    WC_DELIVERED: 'success',     // Teslim edildi - yeşil
    WC_TRASH: 'secondary',        // Silinmiş - gri
  };
  return colors[status] || 'secondary';
}

/**
 * Get stock log type label
 */
export function getStockLogTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    IN: 'Giriş',
    OUT: 'Çıkış',
    RETURN: 'İade',
    ADJUSTMENT: 'Düzeltme',
    TRANSFER: 'Transfer',
  };
  return labels[type] || type;
}

/**
 * Get stock log type color
 */
export function getStockLogTypeColor(type: string): string {
  const colors: Record<string, string> = {
    IN: 'success',
    OUT: 'danger',
    RETURN: 'warning',
    ADJUSTMENT: 'primary',
    TRANSFER: 'secondary',
  };
  return colors[type] || 'secondary';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Sleep function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export grid utilities
export * from './grid';

