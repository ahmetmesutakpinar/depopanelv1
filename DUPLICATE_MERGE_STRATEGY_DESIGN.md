# Duplicate Product Merge Strategy - Design Document

**Date**: 2024-12-XX  
**Status**: 📋 DESIGN ONLY (No Implementation)  
**Purpose**: Safe merge strategy for duplicate products by barcode

---

## 🎯 Design Goals

1. **Preserve All Data**: No data loss during merge
2. **Maintain Referential Integrity**: All foreign keys must remain valid
3. **Preserve History**: All historical records must be preserved
4. **Safe Operations**: Only merge when safe, never auto-merge risky cases
5. **Audit Trail**: Complete logging of all merge operations

---

## 📋 Master Product Selection Rules

### Priority Order (Highest to Lowest)

#### **PRIORITY 1: Operational History**
**Rule**: Product with most operational history wins
- **Stock Movements**: Product with StockLog entries (has inventory history)
- **Order History**: Product used in OrderItems (has sales history)
- **Tiebreaker**: Product with more total movements/orders

**Rationale**: Products with operational history are "real" products that have been used in the system.

---

#### **PRIORITY 2: Business Logic Dependencies**
**Rule**: Product with business logic dependencies wins
- **CampaignSet Relation**: Product linked to CampaignSet (has business rules)
- **Marketplace Links**: Product has active MarketplaceProduct links (integrated)
- **Tiebreaker**: Product with more dependencies

**Rationale**: Products with business logic dependencies are actively used in workflows.

---

#### **PRIORITY 3: Data Completeness**
**Rule**: Product with more complete data wins
- **Has Variants**: Product with ProductVariant children (more complete)
- **Has Stock Records**: Product with Stock entries (has inventory)
- **Has Location Assignments**: Product with ProductLocationAssignment (has warehouse logic)
- **Tiebreaker**: Product with more complete data fields (description, brand, images, etc.)

**Rationale**: More complete products are likely the "real" product definition.

---

#### **PRIORITY 4: Active Status**
**Rule**: Active product wins over inactive
- **isActive = true** preferred over **isActive = false**
- **Rationale**: Active products are currently in use.

---

#### **PRIORITY 5: Creation Date**
**Rule**: Oldest product wins (first created)
- **createdAt**: Earliest creation date
- **Rationale**: Oldest product is likely the original, newer ones are duplicates.

---

### Master Selection Algorithm

```
FOR each duplicate group (companyId, barcode):
  1. Score each product using priority rules
  2. Select product with highest score
  3. If tie, use tiebreaker rules
  4. If still tied, select oldest (createdAt)
  5. Mark selected product as MASTER
  6. Mark others as MERGE_CANDIDATES
```

**Scoring System:**
```
Score = (
  (hasStockMovements ? 1000 : 0) +
  (hasOrderItems ? 1000 : 0) +
  (hasCampaignSet ? 500 : 0) +
  (hasMarketplaceLinks ? 300 : 0) +
  (hasVariants ? 200 : 0) +
  (hasStockRecords ? 100 : 0) +
  (hasLocationAssignments ? 50 : 0) +
  (isActive ? 10 : 0) +
  (dataCompletenessScore * 1)
)
```

---

## 🔄 What Happens to Non-Master Products

### Data Migration Strategy

#### **1. StockLog Entries (IMMUTABLE - NO MIGRATION)**
- **Action**: ❌ **DO NOT MIGRATE**
- **Reason**: StockLog is immutable ledger - changing productId would corrupt history
- **Solution**: Keep StockLog entries pointing to original productId
- **Note**: Stock calculations must aggregate across all products in duplicate group

#### **2. OrderItems (PRESERVE - NO MIGRATION)**
- **Action**: ❌ **DO NOT MIGRATE**
- **Reason**: OrderItems are historical sales records - changing productId would corrupt order history
- **Solution**: Keep OrderItems pointing to original productId
- **Note**: Reports must handle products that were merged

#### **3. Stock Records**
- **Action**: ⚠️ **CONDITIONAL MIGRATION**
- **Rule**: Only migrate if warehouse/location combination doesn't conflict
- **Process**:
  1. Check if master has stock for same (warehouseId, locationId, variantId)
  2. If conflict: Create new Stock record for master, mark old as merged
  3. If no conflict: Update Stock.productId to master
- **Preservation**: Keep original Stock records for audit

#### **4. MarketplaceProduct Links**
- **Action**: ✅ **MIGRATE TO MASTER**
- **Process**:
  1. Check if master already has link for same (integrationId, marketplaceId)
  2. If conflict: Keep both, mark non-master as duplicate
  3. If no conflict: Update MarketplaceProduct.productId to master
- **Preservation**: Keep original links for audit trail

#### **5. ProductVariants**
- **Action**: ✅ **MIGRATE TO MASTER**
- **Process**:
  1. Check if master has variant with same SKU
  2. If conflict: Keep both, mark non-master as duplicate
  3. If no conflict: Update ProductVariant.productId to master
- **Preservation**: Keep original variants for audit

#### **6. ProductLocationAssignment**
- **Action**: ✅ **MIGRATE TO MASTER**
- **Process**:
  1. Check if master has assignment for same (locationId, variantId)
  2. If conflict: Keep both, mark non-master as duplicate
  3. If no conflict: Update ProductLocationAssignment.productId to master
- **Preservation**: Keep original assignments for audit

#### **7. CampaignSet Relations**
- **Action**: ⚠️ **CONDITIONAL MIGRATION**
- **Rule**: Only if master doesn't have CampaignSet relation
- **Process**:
  1. If master has campaignSetId: Keep non-master relation (both products can be in sets)
  2. If master has no campaignSetId: Update master.campaignSetId from non-master
- **Preservation**: Keep original relations

#### **8. Product Metadata**
- **Action**: ✅ **MERGE INTO MASTER**
- **Process**:
  1. Merge missing fields from non-master to master
  2. Prefer master's values, fill gaps from non-master
  3. Preserve all original data in merge log
- **Fields**: description, brand, imageUrl, gtin, etc.

---

## 🛡️ Data Preservation Requirements

### **MUST PRESERVE (Never Delete)**

1. ✅ **All StockLog Entries**
   - Keep original productId references
   - Required for stock ledger integrity

2. ✅ **All OrderItems**
   - Keep original productId references
   - Required for sales history integrity

3. ✅ **All Product Records**
   - Mark non-master as `merged = true` (new field)
   - Keep all original data
   - Add `mergedIntoProductId` field (points to master)

4. ✅ **All Foreign Key References**
   - Never delete products that are referenced
   - Update references where safe, preserve where not

### **Merge Metadata (New Fields)**

Add to Product model:
```prisma
model Product {
  // ... existing fields ...
  
  // Merge tracking
  merged              Boolean   @default(false)  // True if this product was merged
  mergedIntoProductId String?                    // Points to master product if merged
  mergedAt            DateTime?                   // When merge occurred
  mergedBy            String?                     // User who performed merge
  mergeReason          String?                    // Why merge was performed
}
```

---

## ⛔ What Must NEVER Be Auto-Merged

### **BLOCKING CONDITIONS (Prevent Merge)**

#### **1. Different SKUs**
- **Rule**: Products with different SKUs must NEVER be merged
- **Reason**: SKU is a separate identity - same barcode, different SKU = different products
- **Action**: Mark as "SKU conflict" - requires manual resolution

#### **2. Conflicting Business Data**
- **Rule**: Products with conflicting critical data must NOT be merged
- **Conflicts**:
  - Different prices (price difference > 10%)
  - Different tax rates
  - Different product types (PRODUCT vs SET)
  - Different categories
- **Action**: Mark as "data conflict" - requires manual review

#### **3. Active Stock Conflicts**
- **Rule**: Products with active stock in same warehouse must NOT be auto-merged
- **Reason**: Merging would combine stock incorrectly
- **Action**: Mark as "stock conflict" - requires manual stock transfer first

#### **4. Pending Orders**
- **Rule**: Products with pending orders must NOT be merged
- **Reason**: Order fulfillment would be affected
- **Action**: Mark as "pending order conflict" - wait for order completion

#### **5. Unresolved Order Items**
- **Rule**: Products referenced in unresolved OrderItems must NOT be merged
- **Reason**: Order resolution depends on product identity
- **Action**: Mark as "unresolved order conflict" - wait for resolution

#### **6. Active CampaignSet Relations**
- **Rule**: Products in active CampaignSets must NOT be auto-merged
- **Reason**: CampaignSet logic depends on specific product IDs
- **Action**: Mark as "campaign conflict" - requires manual review

#### **7. Different Companies**
- **Rule**: Products from different companies must NEVER be merged
- **Reason**: Company isolation is fundamental
- **Action**: This should never happen (detection already filters by companyId)

---

## 🔍 Pre-Merge Validation Checklist

### **Before Any Merge Operation:**

1. ✅ **Verify Duplicate Group**
   - Same companyId
   - Same barcode (non-null, non-empty)
   - Count > 1

2. ✅ **Check Blocking Conditions**
   - All products have same SKU? (if not, BLOCK)
   - Same product type? (if not, BLOCK)
   - No active stock conflicts? (if conflict, BLOCK)
   - No pending orders? (if pending, BLOCK)
   - No unresolved order items? (if unresolved, BLOCK)

3. ✅ **Calculate Master Score**
   - Score all products
   - Select master
   - Verify master selection is unambiguous

4. ✅ **Check Data Conflicts**
   - Price differences < 10%? (if not, BLOCK)
   - Same tax rate? (if not, WARN)
   - Same category? (if not, WARN)

5. ✅ **Verify Merge Safety**
   - No foreign key violations will occur
   - All references can be migrated safely
   - Stock calculations will remain correct

---

## 📊 Merge Operation Flow

### **Phase 1: Detection & Validation**
```
1. Detect duplicate group
2. Load all products in group
3. Check blocking conditions
4. If blocked → Mark for manual review, STOP
5. If safe → Continue to Phase 2
```

### **Phase 2: Master Selection**
```
1. Score all products
2. Select master product
3. Verify master selection
4. If ambiguous → Mark for manual review, STOP
5. If clear → Continue to Phase 3
```

### **Phase 3: Data Migration**
```
1. Migrate Stock records (if safe)
2. Migrate MarketplaceProduct links
3. Migrate ProductVariants
4. Migrate ProductLocationAssignments
5. Update CampaignSet relations (if safe)
6. Merge metadata fields
```

### **Phase 4: Mark Non-Master Products**
```
1. Set merged = true
2. Set mergedIntoProductId = master.id
3. Set mergedAt = now()
4. Set mergedBy = userId
5. Set mergeReason = "Duplicate barcode merge"
```

### **Phase 5: Audit & Logging**
```
1. Log all changes
2. Create merge audit record
3. Verify data integrity
4. Report merge completion
```

---

## 🚨 Risk Assessment

### **HIGH RISK (Requires Manual Review)**
- Products with different SKUs
- Products with active stock conflicts
- Products with pending orders
- Products in active CampaignSets

### **MEDIUM RISK (Can Auto-Merge with Warnings)**
- Products with price differences < 10%
- Products with different tax rates
- Products with different categories

### **LOW RISK (Safe to Auto-Merge)**
- Products with no operational history
- Products with no dependencies
- Products that are clearly duplicates (same SKU, same data)

---

## 📝 Merge Audit Requirements

### **Audit Record Structure**
```typescript
{
  mergeId: string;
  timestamp: Date;
  userId: string;
  companyId: string;
  barcode: string;
  masterProductId: string;
  mergedProductIds: string[];
  mergeReason: string;
  preMergeData: {
    master: ProductSnapshot;
    merged: ProductSnapshot[];
  };
  postMergeData: {
    master: ProductSnapshot;
    merged: ProductSnapshot[];
  };
  migrations: {
    stockRecords: number;
    marketplaceLinks: number;
    variants: number;
    locationAssignments: number;
  };
  conflicts: string[];
  warnings: string[];
}
```

---

## ✅ Safe Merge Criteria Summary

### **AUTO-MERGE ALLOWED When:**
- ✅ Same companyId
- ✅ Same barcode
- ✅ Same SKU (or all SKUs are null/empty)
- ✅ Same product type
- ✅ No active stock conflicts
- ✅ No pending orders
- ✅ No unresolved order items
- ✅ Price difference < 10% (or all prices are 0)
- ✅ Master selection is unambiguous

### **MANUAL REVIEW REQUIRED When:**
- ⚠️ Different SKUs
- ⚠️ Active stock conflicts
- ⚠️ Pending orders
- ⚠️ Unresolved order items
- ⚠️ Active CampaignSet relations
- ⚠️ Price difference > 10%
- ⚠️ Different product types
- ⚠️ Ambiguous master selection

### **NEVER MERGE When:**
- ❌ Different companies
- ❌ Different barcodes (shouldn't happen in duplicate group)
- ❌ Products with conflicting critical business data
- ❌ Products that would cause referential integrity violations

---

## 🎯 Implementation Phases (Future)

### **Phase 1: Detection Only** ✅ (COMPLETE)
- Detect duplicates
- Report findings
- No merge operations

### **Phase 2: Safe Merge (Future)**
- Implement master selection
- Implement safe data migration
- Auto-merge only low-risk cases

### **Phase 3: Manual Merge Tools (Future)**
- UI for reviewing duplicates
- Manual merge workflow
- Conflict resolution tools

### **Phase 4: Advanced Merge (Future)**
- Stock transfer before merge
- Order completion before merge
- CampaignSet migration

---

## 📋 Summary

### **Master Selection Priority:**
1. Operational history (StockLog, OrderItems)
2. Business logic dependencies (CampaignSet, Marketplace)
3. Data completeness (Variants, Stock, Locations)
4. Active status
5. Creation date (oldest)

### **Data Preservation:**
- ✅ All StockLog entries (immutable)
- ✅ All OrderItems (historical)
- ✅ All Product records (marked as merged)
- ✅ All foreign key references

### **Never Auto-Merge:**
- ❌ Different SKUs
- ❌ Active stock conflicts
- ❌ Pending orders
- ❌ Unresolved order items
- ❌ Conflicting business data

### **Safe Merge Criteria:**
- ✅ Same SKU
- ✅ No conflicts
- ✅ Unambiguous master
- ✅ No blocking conditions

---

**Design Complete** ✅  
**Ready for Implementation Review** 🎯

