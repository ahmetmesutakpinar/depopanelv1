/**
 * XSS koruması için basit sanitization
 * Not: Production'da DOMPurify kullanılması önerilir
 */

/**
 * HTML tag'lerini temizle
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // SSR durumunda
    return html.replace(/<[^>]*>/g, '');
  }

  // Basit HTML tag temizleme
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * User input'u temizle (XSS koruması)
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/[<>]/g, '') // < ve > karakterlerini kaldır
    .trim();
}

/**
 * URL'yi güvenli hale getir
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  
  try {
    const parsed = new URL(url);
    // Sadece http ve https protokollerine izin ver
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Text'i HTML'e çevir (güvenli)
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * DOMPurify wrapper (eğer yüklüyse)
 * npm install dompurify @types/dompurify
 */
export function sanitizeWithDOMPurify(html: string): string {
  if (typeof window === 'undefined') {
    return html;
  }

  // DOMPurify yüklü değilse basit temizleme yap
  try {
    // @ts-ignore
    if (window.DOMPurify) {
      // @ts-ignore
      return window.DOMPurify.sanitize(html);
    }
  } catch {
    // DOMPurify yok, basit temizleme
  }

  return sanitizeHtml(html);
}

