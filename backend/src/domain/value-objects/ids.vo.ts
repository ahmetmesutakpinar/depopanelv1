/**
 * ID Value Objects
 * 
 * Type-safe identifiers for domain entities.
 * These provide type safety and prevent ID mixing.
 * 
 * TODO: Add UUID validation
 * TODO: Add ID generation helpers
 */

/**
 * Company ID value object
 */
export class CompanyId {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('CompanyId cannot be empty');
    }
    // TODO: Add UUID validation
    this.value = value;
  }

  equals(other: CompanyId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Order ID value object
 */
export class OrderId {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('OrderId cannot be empty');
    }
    // TODO: Add UUID validation
    this.value = value;
  }

  equals(other: OrderId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Product ID value object
 */
export class ProductId {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('ProductId cannot be empty');
    }
    // TODO: Add UUID validation
    this.value = value;
  }

  equals(other: ProductId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

