/**
 * SKU Value Object
 * 
 * Represents a Stock Keeping Unit (product identifier).
 * Value objects are immutable and compared by value.
 * 
 * Business Rules:
 * - SKU cannot be empty
 * - SKU must be unique within a company
 * - SKU format validation (alphanumeric, dashes, underscores)
 * 
 * TODO: Add format validation
 * TODO: Add SKU normalization
 */

export class SKU {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('SKU cannot be empty');
    }
    // TODO: Add format validation
    this.value = value.trim().toUpperCase();
  }

  /**
   * Check equality by value
   */
  equals(other: SKU): boolean {
    return this.value === other.value;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }
}

