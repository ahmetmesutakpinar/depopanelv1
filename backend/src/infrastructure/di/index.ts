/**
 * Dependency Injection Layer
 * 
 * This layer provides dependency injection and composition root functionality.
 * 
 * Architecture:
 * - Centralized dependency registration
 * - Explicit wiring (no magic)
 * - Infrastructure layer only
 * - Keeps business logic isolated
 * 
 * Structure:
 * - bindings.ts - Defines how dependencies are wired
 * - container.ts - Provides resolved dependencies
 * 
 * Usage:
 * ```ts
 * import { container } from './infrastructure/di/index.js';
 * 
 * const useCase = container.getCreateProductUseCase();
 * const result = await useCase.execute(input);
 * ```
 */

export { container, createContainer, Container } from './container.js';
export { repositoryBindings, useCaseBindings, createMarketplaceAdapter, unitOfWorkBinding } from './bindings.js';
export type { ITransactionManager, IUseCaseLogger } from './bindings.js';

