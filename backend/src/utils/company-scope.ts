/**
 * Multi-Tenant Company Scope Utilities
 * 
 * Bu modül tüm veri sorgularında companyId zorunluluğunu garanti eder.
 * Her repository ve service fonksiyonunda kullanılmalıdır.
 */

/**
 * Herhangi bir where koşuluna companyId ekler (multi-tenant güvenlik)
 * 
 * @example
 * const where = withCompanyScope({ isActive: true }, companyId);
 * // Result: { isActive: true, companyId: "xxx" }
 */
export function withCompanyScope<T extends object>(
  where: T,
  companyId: string
): T & { companyId: string } {
  if (!companyId || companyId.trim() === '') {
    throw new Error('companyId is required for data isolation');
  }

  return {
    ...where,
    companyId,
  };
}

/**
 * Birden fazla where koşulunu companyId ile birleştirir (OR durumları için)
 * 
 * @example
 * const where = withCompanyScopeOr([
 *   { status: 'PENDING' },
 *   { status: 'PROCESSING' }
 * ], companyId);
 * // Result: { OR: [...], companyId: "xxx" }
 */
export function withCompanyScopeOr<T extends object>(
  whereArray: T[],
  companyId: string
): { OR: T[]; companyId: string } {
  if (!companyId || companyId.trim() === '') {
    throw new Error('companyId is required for data isolation');
  }

  return {
    OR: whereArray,
    companyId,
  };
}

/**
 * CompanyId'yi doğrular ve geçerli değilse hata fırlatır
 */
export function validateCompanyId(companyId: string | undefined | null): asserts companyId is string {
  if (!companyId || companyId.trim() === '') {
    throw new Error('companyId is required');
  }
}

/**
 * İki companyId'nin eşit olup olmadığını kontrol eder (güvenlik)
 */
export function assertCompanyAccess(
  resourceCompanyId: string,
  userCompanyId: string,
  isSuperAdmin: boolean = false
): void {
  if (isSuperAdmin) {
    return; // Super admin tüm şirketlere erişebilir
  }

  if (resourceCompanyId !== userCompanyId) {
    throw new Error('Access denied: Company mismatch');
  }
}

/**
 * Prisma select objesine companyId ekler
 */
export function withCompanyScopeSelect<T extends object>(
  select: T,
  includeCompanyId: boolean = true
): T & { companyId?: true } {
  if (!includeCompanyId) {
    return select;
  }

  return {
    ...select,
    companyId: true,
  };
}

