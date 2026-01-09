<!-- 0cf414a0-0d44-44d2-b299-c0fd7cad8fde 329af97d-a7f8-4bef-bc24-944f91c857fb -->
# Safe Wrong-Merge Recovery with Merge Trace

## Overview

Implement an immutable merge trace system that records every reference change during product merge, enabling deterministic and safe revert operations. This eliminates the need for SKU/barcode matching or timestamp heuristics.

---

## 1. Schema Extension

### 1.1 Add Merge Trace Model

**File**: `backend/prisma/schema.prisma`

Add new model and enum:

```prisma
enum MergeEntityType {
  ORDER_ITEM
  STOCK_LOG
  MARKETPLACE_LINK
  CAMPAIGN_SET_REFERENCE
}

model ProductMergeReference {
  id               String          @id @default(uuid())
  mergeId          String          // Unique identifier for this merge operation
  companyId        String
  entityType       MergeEntityType
  entityId         String          // ID of the entity being re-linked (OrderItem.id, StockLog.id, etc.)
  fromProductId    String          // Original product ID before merge
  toProductId      String          // Master product ID after merge
  createdAt        DateTime        @default(now())
  
  @@index([mergeId])
  @@index([entityType, entityId])
  @@index([fromProductId])
  @@index([toProductId])
  @@index([companyId])
  @@map("product_merge_references")
}
```

### 1.2 Add Revert Tracking Fields to Product

**File**: `backend/prisma/schema.prisma`

Add to Product model (if not already present):

```prisma
model Product {
  // ... existing fields ...
  
  // MERGE TRACKING: Fields for duplicate product merge operations
  mergedIntoProductId String?                    // Points to master product if this product was merged
  mergedAt            DateTime?                   // When merge occurred
  mergedBy            String?                     // User who performed merge (optional)
  
  // REVERT TRACKING: Fields for merge revert operations
  mergeRevertedAt     DateTime?                   // When merge was reverted
  mergeRevertedBy     String?                     // User who reverted merge (optional)
  mergeRevertReason   String?                     // Reason for revert
  
  // ... rest of fields ...
}
```

---

## 2. Update Merge Implementation

### 2.1 Generate Merge ID

**File**: `backend/src/repositories/product.repository.ts`

Update `mergeDuplicateProducts()` method:

- Generate unique `mergeId` (UUID) at start of merge
- Use this `mergeId` for all trace records in this merge operation

### 2.2 Create Trace Records Before Re-linking

**File**: `backend/src/repositories/product.repository.ts`

**CRITICAL RULE**: NO re-link is allowed without creating a trace record first.

**For OrderItems**:

```typescript
// 1. Get all OrderItems that will be re-linked
const orderItemsToMove = await tx.orderItem.findMany({
  where: { productId: { in: duplicateProductIds } },
  select: { id: true, productId: true },
});

// 2. Create trace records BEFORE re-linking
for (const item of orderItemsToMove) {
  await tx.productMergeReference.create({
    data: {
      mergeId,
      companyId,
      entityType: 'ORDER_ITEM',
      entityId: item.id,
      fromProductId: item.productId, // Original duplicate product
      toProductId: masterProductId,
    },
  });
}

// 3. THEN re-link
await tx.orderItem.updateMany({
  where: { productId: { in: duplicateProductIds } },
  data: { productId: masterProductId },
});
```

**For StockLogs**:

```typescript
// Same pattern: trace first, then re-link
const stockLogsToMove = await tx.stockLog.findMany({
  where: { productId: { in: duplicateProductIds } },
  select: { id: true, productId: true },
});

for (const log of stockLogsToMove) {
  await tx.productMergeReference.create({
    data: {
      mergeId,
      companyId,
      entityType: 'STOCK_LOG',
      entityId: log.id,
      fromProductId: log.productId,
      toProductId: masterProductId,
    },
  });
}

await tx.stockLog.updateMany({
  where: { productId: { in: duplicateProductIds } },
  data: { productId: masterProductId },
});
```

**For MarketplaceProduct links**:

```typescript
const marketplaceLinksToMove = await tx.marketplaceProduct.findMany({
  where: { productId: { in: duplicateProductIds } },
  select: { id: true, productId: true },
});

for (const link of marketplaceLinksToMove) {
  await tx.productMergeReference.create({
    data: {
      mergeId,
      companyId,
      entityType: 'MARKETPLACE_LINK',
      entityId: link.id,
      fromProductId: link.productId,
      toProductId: masterProductId,
    },
  });
}

await tx.marketplaceProduct.updateMany({
  where: { productId: { in: duplicateProductIds } },
  data: { productId: masterProductId },
});
```

**For CampaignSet references**:

```typescript
// Track CampaignSet reference transfer
if (duplicateWithCampaignSet) {
  await tx.productMergeReference.create({
    data: {
      mergeId,
      companyId,
      entityType: 'CAMPAIGN_SET_REFERENCE',
      entityId: masterProductId, // Master product receives the reference
      fromProductId: duplicateWithCampaignSet.id,
      toProductId: masterProductId,
    },
  });
}
```

### 2.3 Transaction Safety

All trace record creation and re-linking must be in the SAME transaction:

- If any trace record creation fails → rollback
- If any re-link fails → rollback
- Guarantees: either all traces + re-links succeed, or nothing changes

---

## 3. Implement Safe Revert

### 3.1 Repository Method

**File**: `backend/src/repositories/product.repository.ts`

Create `revertProductMerge()` method:

```typescript
async revertProductMerge(input: {
  mergeId: string;
  companyId: string;
  userId?: string;
  reason: string;
}): Promise<{
  mergeId: string;
  revertedProductIds: string[];
  orderItemsRestored: number;
  stockLogsRestored: number;
  marketplaceLinksRestored: number;
  campaignSetReferencesRestored: number;
  productsReactivated: number;
}> {
  // Validation: Ensure merge trace exists
  const traceRecords = await prisma.productMergeReference.findMany({
    where: { mergeId: input.mergeId, companyId: input.companyId },
  });

  if (traceRecords.length === 0) {
    throw new Error(`Merge trace not found for mergeId: ${input.mergeId}. Revert is FORBIDDEN.`);
  }

  // Get unique product IDs that were merged
  const mergedProductIds = [...new Set(traceRecords.map(t => t.fromProductId))];
  
  // Verify all merged products still exist and are marked as merged
  const mergedProducts = await prisma.product.findMany({
    where: {
      id: { in: mergedProductIds },
      mergedIntoProductId: { not: null },
    },
  });

  if (mergedProducts.length !== mergedProductIds.length) {
    throw new Error('Some merged products are missing or not properly marked. Revert is FORBIDDEN.');
  }

  // Get master product ID (should be same for all traces)
  const masterProductId = traceRecords[0].toProductId;

  // Perform revert in single transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Re-link OrderItems back to original products
    const orderItemTraces = traceRecords.filter(t => t.entityType === 'ORDER_ITEM');
    let orderItemsRestored = 0;
    
    for (const trace of orderItemTraces) {
      // Verify entity still exists and points to master
      const orderItem = await tx.orderItem.findUnique({
        where: { id: trace.entityId },
      });
      
      if (orderItem && orderItem.productId === masterProductId) {
        await tx.orderItem.update({
          where: { id: trace.entityId },
          data: { productId: trace.fromProductId },
        });
        orderItemsRestored++;
      }
    }

    // 2. Re-link StockLogs back to original products
    const stockLogTraces = traceRecords.filter(t => t.entityType === 'STOCK_LOG');
    let stockLogsRestored = 0;
    
    for (const trace of stockLogTraces) {
      const stockLog = await tx.stockLog.findUnique({
        where: { id: trace.entityId },
      });
      
      if (stockLog && stockLog.productId === masterProductId) {
        await tx.stockLog.update({
          where: { id: trace.entityId },
          data: { productId: trace.fromProductId },
        });
        stockLogsRestored++;
      }
    }

    // 3. Re-link MarketplaceProduct links
    const marketplaceTraces = traceRecords.filter(t => t.entityType === 'MARKETPLACE_LINK');
    let marketplaceLinksRestored = 0;
    
    for (const trace of marketplaceTraces) {
      const marketplaceLink = await tx.marketplaceProduct.findUnique({
        where: { id: trace.entityId },
      });
      
      if (marketplaceLink && marketplaceLink.productId === masterProductId) {
        await tx.marketplaceProduct.update({
          where: { id: trace.entityId },
          data: { productId: trace.fromProductId },
        });
        marketplaceLinksRestored++;
      }
    }

    // 4. Restore CampaignSet references
    const campaignSetTraces = traceRecords.filter(t => t.entityType === 'CAMPAIGN_SET_REFERENCE');
    let campaignSetReferencesRestored = 0;
    
    for (const trace of campaignSetTraces) {
      // Restore CampaignSet to original product
      const originalProduct = await tx.product.findUnique({
        where: { id: trace.fromProductId },
      });
      
      if (originalProduct && originalProduct.campaignSetId === null) {
        // Get CampaignSet from master (if it was transferred)
        const masterProduct = await tx.product.findUnique({
          where: { id: masterProductId },
          select: { campaignSetId: true },
        });
        
        if (masterProduct?.campaignSetId) {
          await tx.product.update({
            where: { id: trace.fromProductId },
            data: { campaignSetId: masterProduct.campaignSetId },
          });
          campaignSetReferencesRestored++;
        }
      }
    }

    // 5. Reactivate merged products
    const now = new Date();
    const reactivatedResult = await tx.product.updateMany({
      where: { id: { in: mergedProductIds } },
      data: {
        isActive: true,
        mergedIntoProductId: null,
        mergedAt: null,
        mergedBy: null,
        mergeRevertedAt: now,
        mergeRevertedBy: input.userId,
        mergeRevertReason: input.reason,
      } as any, // Type assertion until Prisma generate
    });

    return {
      mergeId: input.mergeId,
      revertedProductIds: mergedProductIds,
      orderItemsRestored,
      stockLogsRestored,
      marketplaceLinksRestored,
      campaignSetReferencesRestored,
      productsReactivated: reactivatedResult.count,
    };
  }
}
```

### 3.2 Service Layer

**File**: `backend/src/services/product.service.ts`

Create `revertProductMerge()` service method:

```typescript
async revertProductMerge(input: {
  mergeId: string;
  companyId: string;
  userId?: string;
  reason: string;
}): Promise<{
  success: boolean;
  mergeId: string;
  revertedProductIds: string[];
  orderItemsRestored: number;
  stockLogsRestored: number;
  marketplaceLinksRestored: number;
  campaignSetReferencesRestored: number;
  productsReactivated: number;
  warnings: string[];
}> {
  // Log before revert
  // Call repository method
  // Log after revert
  // Run post-recovery verification
  // Return summary with warnings
}
```

### 3.3 Post-Recovery Verification

After revert:

- Run `verifyPostMergeIntegrity()` to check for orphaned references
- If duplicate barcodes detected → WARN (expected temporarily)
- If orphaned references → THROW ERROR (data corruption)

---

## 4. Safety Rules Implementation

### 4.1 Validation Checks

Before allowing revert:

1. **Merge trace must exist**: If no trace records found → THROW ERROR
2. **All merged products must exist**: If any missing → THROW ERROR
3. **All merged products must be marked as merged**: If not → THROW ERROR
4. **No new references after merge**: Check if any OrderItems/StockLogs were created AFTER merge timestamp that reference master → WARN (but allow revert)

### 4.2 Entity Verification During Revert

For each trace record:

- Verify entity still exists
- Verify entity currently points to master (toProductId)
- Only re-link if both conditions true
- If entity points elsewhere → WARN and skip (new reference created after merge)

### 4.3 Transaction Guarantees

- All revert operations in single transaction
- If any step fails → rollback everything
- No partial reverts allowed

---

## 5. Logging & Audit

### 5.1 Log Before Revert

```typescript
logger.info('[ProductService] Starting merge revert', {
  mergeId: input.mergeId,
  companyId: input.companyId,
  userId: input.userId,
  reason: input.reason,
  traceRecordCount: traceRecords.length,
});
```

### 5.2 Log After Revert

```typescript
logger.info('[ProductService] Merge revert completed', {
  mergeId: input.mergeId,
  revertedProductIds: result.revertedProductIds,
  orderItemsRestored: result.orderItemsRestored,
  stockLogsRestored: result.stockLogsRestored,
  // ... other counts
});
```

### 5.3 Audit Trail

All revert operations are permanently recorded in:

- `Product.mergeRevertedAt`
- `Product.mergeRevertedBy`
- `Product.mergeRevertReason`
- Application logs

---

## 6. Files to Modify

1. **`backend/prisma/schema.prisma`**

   - Add `MergeEntityType` enum
   - Add `ProductMergeReference` model
   - Add revert tracking fields to `Product` model

2. **`backend/src/repositories/product.repository.ts`**

   - Update `mergeDuplicateProducts()` to create trace records
   - Add `revertProductMerge()` method

3. **`backend/src/services/product.service.ts`**

   - Update `mergeDuplicateProducts()` wrapper (if needed)
   - Add `revertProductMerge()` service method

4. **Migration file** (to be generated)

   - `backend/prisma/migrations/XXXX_add_merge_trace/migration.sql`

---

## 7. Testing Strategy

### 7.1 Unit Test Outline

```typescript
describe('ProductMergeReference', () => {
  it('should create trace records before re-linking OrderItems', async () => {
    // Test that merge creates trace records
    // Verify trace records exist before re-link
  });

  it('should forbid revert if trace is missing', async () => {
    // Test that revert throws error if no trace
  });

  it('should restore all references correctly', async () => {
    // Merge products
    // Verify references moved to master
    // Revert merge
    // Verify references restored to originals
  });

  it('should not touch new references created after merge', async () => {
    // Merge products
    // Create new OrderItem referencing master
    // Revert merge
    // Verify new OrderItem still points to master
  });
});
```

---

## 8. Migration Steps

1. **Create Prisma migration**:
   ```bash
   npx prisma migrate dev --name add_merge_trace
   ```

2. **Generate Prisma client**:
   ```bash
   npx prisma generate
   ```

3. **Update merge logic** to create trace records

4. **Test merge** to verify trace records are created

5. **Implement revert logic**

6. **Test revert** to verify references are restored

---

## 9. Critical Constraints

- **StockLog is immutable**: Only `productId` reference changes, quantities NEVER change
- **No hard deletes**: All operations are re-links, never deletions
- **Transaction safety**: All operations atomic (all or nothing)
- **Trace is mandatory**: If trace missing → revert FORBIDDEN
- **No guessing**: Only deterministic trace-based recovery

---

## 10. Success Criteria

After implementation:

- ✅ Every merge creates complete trace records
- ✅ Revert is 100% deterministic (no guessing)
- ✅ Historical data is preserved
- ✅ New references created after merge are not touched
- ✅ Full audit trail for all merge/revert operations
- ✅ Enterprise-grade safety guarantees

### To-dos

- [x] Create unresolved products service and repository methods
- [x] Create admin unresolved products API endpoints (GET, POST link-existing, POST create-and-link)
- [x] Fix order cancellation to use StockLog only (no stock.quantity mutation)
- [x] Fix order return to use StockLog only with idempotency
- [x] Create stock summary API endpoint (calculate from StockLog)
- [x] Add deprecation warnings for old stock fields