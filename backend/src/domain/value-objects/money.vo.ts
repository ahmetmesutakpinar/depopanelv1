/**
 * Money Value Object
 * 
 * Represents a monetary amount with currency.
 * Value objects are immutable and compared by value.
 * 
 * Business Rules:
 * - Amount cannot be negative
 * - Currency must be valid ISO code
 * 
 * TODO: Add currency validation
 * TODO: Add currency conversion logic
 * TODO: Add arithmetic operations (add, subtract, multiply)
 */

export class Money {
  readonly amount: number;
  readonly currency: string;

  constructor(amount: number, currency: string = 'TRY') {
    if (amount < 0) {
      throw new Error('Money amount cannot be negative');
    }
    this.amount = amount;
    this.currency = currency;
  }

  /**
   * Add two money values (must be same currency)
   * TODO: Implement addition logic
   */
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract two money values (must be same currency)
   * TODO: Implement subtraction logic
   */
  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot subtract money with different currencies');
    }
    return new Money(Math.max(0, this.amount - other.amount), this.currency);
  }

  /**
   * Multiply money by a factor
   * TODO: Implement multiplication logic
   */
  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  /**
   * Check equality by value
   */
  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}

