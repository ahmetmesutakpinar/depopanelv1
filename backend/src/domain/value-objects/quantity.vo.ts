/**
 * Quantity Value Object
 * 
 * Represents a quantity amount with validation.
 * Value objects are immutable and compared by value.
 * 
 * Business Rules:
 * - Quantity cannot be negative
 * - Quantity must be an integer (for discrete items)
 * 
 * TODO: Add validation logic
 * TODO: Add arithmetic operations
 */

export class Quantity {
  readonly value: number;

  constructor(value: number) {
    if (value < 0) {
      throw new Error('Quantity cannot be negative');
    }
    if (!Number.isInteger(value)) {
      throw new Error('Quantity must be an integer');
    }
    this.value = value;
  }

  /**
   * Add two quantities
   * TODO: Implement addition logic
   */
  add(other: Quantity): Quantity {
    return new Quantity(this.value + other.value);
  }

  /**
   * Subtract two quantities
   * TODO: Implement subtraction logic
   */
  subtract(other: Quantity): Quantity {
    return new Quantity(Math.max(0, this.value - other.value));
  }

  /**
   * Check if quantity is zero
   */
  isZero(): boolean {
    return this.value === 0;
  }

  /**
   * Check equality by value
   */
  equals(other: Quantity): boolean {
    return this.value === other.value;
  }
}

