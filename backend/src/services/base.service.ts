/**
 * Base Service class
 * Provides common functionality for all services
 */
export abstract class BaseService {
  /**
   * Validate required fields
   */
  protected validateRequired<T extends Record<string, any>>(
    data: T,
    fields: (keyof T)[]
  ): void {
    const missing: string[] = [];
    
    for (const field of fields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        missing.push(String(field));
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Gerekli alanlar eksik: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate company ID
   */
  protected validateCompanyId(companyId: string | undefined | null): string {
    if (!companyId) {
      throw new Error('Şirket ID gerekli');
    }
    return companyId;
  }

  /**
   * Sanitize string input
   */
  protected sanitizeString(input: string | undefined | null): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }
    return input.trim() || null;
  }

  /**
   * Normalize pagination options
   */
  protected normalizePagination(options?: {
    page?: number;
    limit?: number;
  }): { skip: number; take: number; page: number; limit: number } {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, Math.min(100, options?.limit || 20));
    const skip = (page - 1) * limit;

    return { skip, take: limit, page, limit };
  }
}

