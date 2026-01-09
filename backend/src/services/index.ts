/**
 * Services Layer
 * 
 * This layer is split into:
 * - application/ - Application services (use cases, orchestration)
 * - domain/ - Domain services (business logic that doesn't belong to entities)
 * 
 * Architecture:
 * - Application services coordinate between repositories and domain services
 * - Domain services contain business logic that spans multiple entities
 * - Services should be thin and delegate to domain entities when possible
 * 
 * TODO: Reorganize existing services:
 * - Move business logic to domain services
 * - Move orchestration to application services
 * - Extract use cases from controllers
 */

export {};
