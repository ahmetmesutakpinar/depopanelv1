/**
 * MarketplaceType Value Object
 * 
 * Represents a marketplace platform type.
 * Value objects are immutable and compared by value.
 * 
 * TODO: Add validation
 */

export type MarketplaceTypeValue = 
  | 'WOOCOMMERCE'
  | 'TRENDYOL'
  | 'HEPSIBURADA'
  | 'N11'
  | 'PAZARAMA'
  | 'AMAZON';

export class MarketplaceType {
  readonly value: MarketplaceTypeValue;

  constructor(value: MarketplaceTypeValue | string) {
    const validTypes: MarketplaceTypeValue[] = [
      'WOOCOMMERCE',
      'TRENDYOL',
      'HEPSIBURADA',
      'N11',
      'PAZARAMA',
      'AMAZON',
    ];

    if (!validTypes.includes(value as MarketplaceTypeValue)) {
      throw new Error(`Invalid marketplace type: ${value}`);
    }

    this.value = value as MarketplaceTypeValue;
  }

  /**
   * Check equality by value
   */
  equals(other: MarketplaceType): boolean {
    return this.value === other.value;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }
}

