/**
 * Domain Layer
 * 
 * This layer contains the core business logic and rules.
 * It is independent of frameworks, databases, and external services.
 * 
 * Structure:
 * - entities/ - Domain entities (Product, Order, Stock, etc.)
 * - value-objects/ - Immutable value objects (Money, Address, etc.)
 * - events/ - Domain events (OrderCreated, StockDepleted, etc.)
 * - errors/ - Domain-specific errors
 * 
 * Principles:
 * - No dependencies on infrastructure
 * - Pure business logic
 * - Rich domain models with behavior
 */

// Export all domain entities
export * from './entities/index.js';

// Export all value objects
export * from './value-objects/index.js';

// Export all domain events
export * from './events/index.js';

// Export all domain errors
export * from './errors/index.js';

