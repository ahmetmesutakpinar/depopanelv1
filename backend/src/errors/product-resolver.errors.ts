/**
 * Product Resolver Domain Errors
 * 
 * Explicit errors for product resolution failures with metadata.
 */

export class DuplicateBarcodeError extends Error {
  constructor(
    public readonly barcode: string,
    public readonly companyId: string,
    public readonly duplicateProductIds: string[]
  ) {
    super(`Multiple products found with barcode: ${barcode}. Product IDs: ${duplicateProductIds.join(', ')}`);
    this.name = 'DuplicateBarcodeError';
  }
}

export class DuplicateSkuError extends Error {
  constructor(
    public readonly sku: string,
    public readonly companyId: string,
    public readonly duplicateProductIds: string[]
  ) {
    super(`Multiple products found with SKU: ${sku}. Product IDs: ${duplicateProductIds.join(', ')}`);
    this.name = 'DuplicateSkuError';
  }
}

export class InvalidResolverInputError extends Error {
  constructor(
    public readonly reason: string,
    public readonly input: Record<string, unknown>
  ) {
    super(`Invalid resolver input: ${reason}`);
    this.name = 'InvalidResolverInputError';
  }
}

