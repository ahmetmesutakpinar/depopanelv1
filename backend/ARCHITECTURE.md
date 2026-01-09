# Clean Architecture - Migration Guide

## Overview

This document describes the target Clean Architecture structure and migration plan.

## Architecture Layers

### 1. Domain Layer (`src/domain/`)
**Purpose**: Core business logic, independent of frameworks and infrastructure.

- **entities/**: Business objects with identity and lifecycle
- **value-objects/**: Immutable objects defined by attributes
- **events/**: Domain events for decoupling
- **errors/**: Domain-specific error classes

**Rules**:
- No dependencies on other layers
- Pure business logic
- Framework-agnostic

### 2. Contracts Layer (`src/contracts/`)
**Purpose**: Define interfaces and contracts (Dependency Inversion Principle).

- **marketplace.contract.ts**: Marketplace adapter interface
- **dto/**: Data Transfer Objects

**Rules**:
- Only interfaces and types
- No implementations
- Used by domain and application layers

### 3. Application Layer (`src/services/application/`)
**Purpose**: Orchestrate use cases and coordinate between layers.

**Rules**:
- Depends on domain and contracts
- Thin orchestration layer
- One use case per file

### 4. Domain Services (`src/services/domain/`)
**Purpose**: Business logic that spans multiple entities.

**Rules**:
- Stateless services
- Pure business logic
- No infrastructure dependencies

### 5. Modules (`src/modules/`)
**Purpose**: Organize code by business capability.

Each module is self-contained:
- **products/**: Product management
- **orders/**: Order processing
- **stock/**: Inventory management
- **pricing/**: Pricing and discounts
- **integrations/**: Integration management
- **companies/**: Multi-tenant management
- **users/**: User and auth

### 6. Adapters (`src/adapters/`)
**Purpose**: Connect to external systems.

- **marketplaces/**: Marketplace platform adapters
  - Each adapter implements `MarketplaceAdapter` interface
  - Handles platform-specific API calls

### 7. Infrastructure (`src/infrastructure/`)
**Purpose**: Technical implementations.

- **prisma/**: Database access
- **logger/**: Logging implementation
- **env/**: Environment config
- **http/**: HTTP clients

**Rules**:
- Implements contracts
- Can be swapped without changing domain logic

### 8. Repositories (`src/repositories/`)
**Purpose**: Data access abstraction.

- Define interfaces (in contracts)
- Implementations in infrastructure

## Migration Strategy

### Phase 1: Structure (Current)
✅ Create folder structure
✅ Create placeholder files
✅ Define contracts

### Phase 2: Domain Layer
- Extract domain entities
- Create value objects
- Define domain events
- Create domain errors

### Phase 3: Contracts
- Create repository interfaces
- Define DTOs
- Create service interfaces

### Phase 4: Adapters
- Move marketplace integrations
- Implement MarketplaceAdapter
- Extract platform-specific logic

### Phase 5: Services
- Extract use cases
- Move to application services
- Extract domain services

### Phase 6: Infrastructure
- Move Prisma implementations
- Move logger
- Move config

### Phase 7: Controllers
- Update controllers to use new structure
- Map DTOs
- Handle errors

## Principles

1. **Dependency Rule**: Dependencies point inward
   - Domain has no dependencies
   - Application depends on domain
   - Infrastructure depends on application/domain

2. **Interface Segregation**: Small, focused interfaces

3. **Dependency Inversion**: Depend on abstractions, not concretions

4. **Single Responsibility**: Each class/module has one reason to change

## Benefits

- **Testability**: Easy to test domain logic in isolation
- **Maintainability**: Clear separation of concerns
- **Flexibility**: Easy to swap implementations
- **Scalability**: Easy to add new features
- **Pluggability**: Marketplace adapters are pluggable

## Current State

The structure is prepared but existing code remains in original locations.
Migration will happen incrementally without breaking changes.

