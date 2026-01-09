# 🏗️ DepoPanel - Architecture Analysis & Refactoring Plan

**Date:** 2025-12-03  
**Status:** Initial Analysis Complete  
**Priority:** Critical Issues Identified

---

## 📊 EXECUTIVE SUMMARY

The DepoPanel WMS system is **80-85% complete** with solid foundations. This document identifies critical issues, missing patterns, and provides a comprehensive refactoring roadmap to achieve **100% production-ready stability**.

### Overall Health Score: **7.5/10**

**Strengths:**
- ✅ Solid database schema with most cascade deletes
- ✅ Good separation of concerns (Controllers → Services → Repositories)
- ✅ Zod validation in place
- ✅ Error handling middleware exists
- ✅ Integration sync system functional

**Critical Gaps:**
- ❌ Missing cascade deletes on some relations
- ❌ No centralized DTO layer
- ❌ Incomplete barcode matching system
- ❌ No token refresh mechanism
- ❌ Missing production monitoring endpoints
- ❌ Cron jobs lack retry/timeout handling

---

## 🔴 CRITICAL ISSUES (Priority 1)

### 1. DATABASE SCHEMA - Missing Cascade Deletes

**Problem:** Some relations will leave orphaned records when parent is deleted.

**Affected Relations:**
```prisma
// ❌ MISSING onDelete: Cascade
Category.parent → Category (self-reference) - No cascade
OrderItem.product → Product - No cascade (should be SetNull or Restrict)
OrderItem.variant → ProductVariant - No cascade (should be SetNull or Restrict)
Stock.location → Location - No cascade (should be SetNull)
StockLog.user → User - No cascade (should be SetNull)
InventoryCountItem.product → Product - No cascade (should be Restrict)
InventoryCountItem.variant → ProductVariant - No cascade (should be Restrict)
InventoryCountItem.location → Location - No cascade (should be SetNull)
InventoryCountItem.countedBy → User - No cascade (should be SetNull)
PickingWave.assignedTo → User - No cascade (should be SetNull)
PickingWave.pickedBy → User - No cascade (should be SetNull)
PickingWave.shippedBy → User - No cascade (should be SetNull)
Order.createdBy → User - No cascade (should be SetNull)
Order.integration → MarketplaceIntegration - No cascade (should be SetNull)
Order.pickingWave → PickingWave - No cascade (should be SetNull)
Order.warehouse → Warehouse - No cascade (should be Restrict)
Order.cargoCompany → CargoCompany - No cascade (should be SetNull)
CampaignStock.location → Location - No cascade (should be SetNull)
SetStock.location → Location - No cascade (should be SetNull)
```

**Impact:** Orphaned records, data integrity issues, potential foreign key constraint violations.

**Fix Required:** Add appropriate `onDelete` strategies:
- `Cascade` - Delete child when parent deleted (most relations)
- `SetNull` - Set FK to null when parent deleted (optional relations like User references)
- `Restrict` - Prevent deletion if children exist (critical relations like Order.warehouse)

---

### 2. BARCODE MATCHING - Incomplete Implementation

**Current State:**
- ✅ Checks: `product.gtin`, `product.barcode`, `variant.barcode`, `product.sku`, `variant.sku`, `item.sku`
- ❌ Missing: `product.ean` field (if exists), custom item codes, case-insensitive matching could be improved

**Location:** `backend/src/services/order.service.ts:545-564`

**Required Fix:**
```typescript
// Create centralized barcode matching utility
// Check ALL possible barcode fields:
// - product.gtin
// - product.ean (if field exists)
// - product.barcode
// - product.sku
// - variant.barcode
// - variant.sku
// - item.sku
// - custom codes
```

---

### 3. TOKEN REFRESH - Missing Mechanism

**Problem:** Frontend has no automatic token refresh. Users get logged out when token expires.

**Location:** `frontend/src/services/api.ts:21-93`

**Current:** Only handles 401 by redirecting to login.

**Required:** Implement refresh token flow:
1. Detect 401 with specific "token expired" message
2. Call `/api/auth/refresh` with refresh token
3. Update stored token
4. Retry original request
5. If refresh fails, redirect to login

---

### 4. CRON JOBS - No Retry/Timeout Handling

**Problem:** Cron jobs can fail silently or hang indefinitely.

**Location:** `backend/src/utils/job-*.ts`

**Current Issues:**
- ❌ No retry mechanism for failed syncs
- ❌ No HTTP timeout configuration
- ❌ No circuit breaker pattern
- ❌ Errors logged but not actionable

**Required:**
- Add retry logic (3 attempts with exponential backoff)
- Add HTTP timeout (30s default)
- Add circuit breaker (stop syncing after 5 consecutive failures)
- Enhanced error logging with context

---

### 5. INVENTORY COUNT - StockLog Type Verification

**Status:** ✅ **VERIFIED CORRECT**

**Location:** `backend/src/repositories/inventory-count.repository.ts:286-299`

**Current Implementation:**
```typescript
await tx.stockLog.create({
  type: 'ADJUSTMENT', // ✅ CORRECT
  quantity: Math.abs(item.difference),
  previousQty: item.systemQty,
  newQty: item.countedQty,
  note: `Stok sayımı: ${count.code}`,
  // ...
});
```

**Verdict:** ✅ No changes needed. ADJUSTMENT type is correct for inventory count approvals.

---

### 6. RETURNS - StockLog Type Verification

**Status:** ✅ **VERIFIED CORRECT**

**Location:** `backend/src/services/return.service.ts:244-257`

**Current Implementation:**
```typescript
await tx.stockLog.create({
  type: 'RETURN', // ✅ CORRECT
  quantity: returnItem.quantity,
  previousQty: stock.quantity,
  newQty: stock.quantity + returnItem.quantity,
  note: `İade: ${returnRecord.returnNumber}`,
  // ...
});
```

**Verdict:** ✅ No changes needed. RETURN type is correct for approved returns.

---

## 🟡 HIGH PRIORITY ISSUES (Priority 2)

### 7. MISSING DTO LAYER

**Problem:** Controllers directly use request bodies without DTO transformation.

**Impact:** 
- No type safety between layers
- Inconsistent data shapes
- Hard to version APIs

**Required:**
- Create `backend/src/dto/` directory
- Define DTOs for all request/response types
- Use class-validator or Zod for DTO validation
- Transform DTOs in controllers before passing to services

**Example Structure:**
```
backend/src/dto/
  ├── product.dto.ts
  ├── order.dto.ts
  ├── stock.dto.ts
  └── ...
```

---

### 8. VALIDATION - Inconsistent Application

**Current State:**
- ✅ Zod schemas exist in controllers
- ❌ Not all endpoints use validation middleware
- ❌ Some endpoints validate manually in controllers

**Required:**
- Ensure ALL endpoints use `validateBody()` or `validateParams()` middleware
- Remove manual validation from controllers
- Create shared validation schemas

---

### 9. ERROR HANDLING - Inconsistent Patterns

**Current State:**
- ✅ Error middleware exists
- ✅ Custom error classes (AppError, NotFoundError, etc.)
- ❌ Some services throw generic Error instead of custom errors
- ❌ Error messages not always user-friendly

**Required:**
- Audit all services for consistent error throwing
- Replace generic `Error` with custom error classes
- Ensure all error messages are user-friendly (Turkish)
- Add error codes for programmatic handling

---

### 10. FRONTEND - React Query Invalidation

**Problem:** Mutations might not properly invalidate related queries.

**Required:**
- Audit all mutations for proper `queryClient.invalidateQueries()`
- Ensure optimistic updates where appropriate
- Add loading states consistently

---

## 🟢 MEDIUM PRIORITY (Priority 3)

### 11. MISSING PRODUCTION ENDPOINTS

**Required Endpoints:**
- `GET /api/health` - Health check
- `GET /api/cron/status` - Cron job status
- `GET /api/metrics` - System metrics (optional)

---

### 12. MISSING DATABASE INDEXES

**Potential Missing Indexes:**
- `OrderItem.sku` - Frequently queried
- `Product.gtin` - Barcode lookups
- `ProductVariant.barcode` - Barcode lookups
- `SyncLog.companyId + type + createdAt` - Composite for filtering

**Action:** Analyze query patterns and add indexes where needed.

---

### 13. INTEGRATION - Error Recovery

**Current:** Errors logged but integration status not updated.

**Required:**
- Update integration `status` to `ERROR` after N consecutive failures
- Add manual retry endpoint
- Add integration health dashboard

---

### 14. FRONTEND - Loading States

**Problem:** Some pages lack loading skeletons.

**Required:**
- Add loading skeletons to all list pages
- Add loading states to forms
- Improve UX during async operations

---

## 📋 REFACTORING ROADMAP

### Phase 1: Critical Fixes (Week 1)
1. ✅ Fix missing cascade deletes in schema
2. ✅ Create migration for schema changes
3. ✅ Implement centralized barcode matching utility
4. ✅ Add token refresh mechanism
5. ✅ Enhance cron job error handling

### Phase 2: Architecture Improvements (Week 2)
1. ✅ Create DTO layer
2. ✅ Standardize validation
3. ✅ Improve error handling consistency
4. ✅ Add production endpoints

### Phase 3: Frontend Stabilization (Week 3)
1. ✅ Fix React Query invalidations
2. ✅ Add loading states
3. ✅ Improve error boundaries
4. ✅ Add toast notifications consistently

### Phase 4: Testing & Documentation (Week 4)
1. ✅ Add unit tests
2. ✅ Add integration tests
3. ✅ Update API documentation
4. ✅ Create deployment guide

---

## 🎯 SUCCESS METRICS

**Target Metrics:**
- ✅ Zero orphaned records in database
- ✅ 100% endpoint validation coverage
- ✅ < 100ms API response time (p95)
- ✅ 99.9% uptime
- ✅ Zero critical bugs in production

---

## 📝 NOTES

- All changes must be backward compatible
- Database migrations must be reversible
- Frontend changes must not break existing functionality
- All new code must have TypeScript strict mode enabled

---

**Next Steps:** Begin Phase 1 implementation.

