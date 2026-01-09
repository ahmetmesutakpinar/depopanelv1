# Marketplace Links Validation & Merge Support

## Problem

When products are merged or listed, marketplace links should be derived automatically from `MarketplaceProduct` records. If a marketplace link icon is visible, it must guarantee:
- The `MarketplaceProduct` is linked to the master `productId`
- The integration is active and valid

This ensures visible links act as a real integration health check, not just UI decoration.

---

## Solution Implemented

### 1. Created Centralized Marketplace Links Helper

**File**: `backend/src/services/product.service.ts`

**New Method**: `getMarketplaceLinksForProducts()`

This private method ensures:
- ✅ Only **active integrations** are considered (`status = 'ACTIVE'` AND `isActive = true`)
- ✅ Only **active MarketplaceProduct records** are included (`isActive = true`)
- ✅ **Merged products** automatically resolve to master product's marketplace links
- ✅ **Double validation** of integration status (query filter + result filter)

**Key Features**:
```typescript
// 1. Filter by active integrations only
where: {
  companyId,
  isActive: true,
  status: 'ACTIVE', // CRITICAL: Only active integrations
}

// 2. Filter by active MarketplaceProduct records
where: {
  productId: { in: masterProductIds },
  integrationId: { in: activeIntegrationIds },
  isActive: true, // CRITICAL: Only active marketplace product links
}

// 3. Resolve merged products to master
const resolvedProductId = mergedToMaster.get(originalProductId) || originalProductId;
```

---

### 2. Updated `getProducts()` Method

**Changes**:
- Replaced direct `MarketplaceProduct` query with `getMarketplaceLinksForProducts()`
- Now automatically handles merged products
- Only shows links for active, valid integrations

**Before**:
```typescript
const integrations = await prisma.marketplaceIntegration.findMany({
  where: { companyId, isActive: true }, // Missing status check
});

const marketplaceLinks = await prisma.marketplaceProduct.findMany({
  where: {
    productId: { in: productIds },
    integrationId: { in: integrations.map(i => i.id) },
    // Missing isActive check
  },
});
```

**After**:
```typescript
const { linksByProductId, linksByProductIdWithUrl, allMarketplaceTypes } = 
  await this.getMarketplaceLinksForProducts(productIds, companyId);
// Automatically handles:
// - Active integration validation
// - Active MarketplaceProduct validation
// - Merged product resolution
```

---

### 3. Updated `getProductById()` Method

**Changes**:
- Replaced direct `MarketplaceProduct` query with `getMarketplaceLinksForProducts()`
- Automatically resolves merged products to master
- Only shows links for active, valid integrations

**Before**:
```typescript
const integrations = await prisma.marketplaceIntegration.findMany({
  where: { companyId, isActive: true }, // Missing status check
});

const marketplaceLinks = await prisma.marketplaceProduct.findMany({
  where: {
    productId: id, // Doesn't handle merged products
    integrationId: { in: integrations.map(i => i.id) },
    // Missing isActive check
  },
});
```

**After**:
```typescript
const { linksByProductId, linksByProductIdWithUrl, allMarketplaceTypes } = 
  await this.getMarketplaceLinksForProducts([id], companyId);
// Automatically:
// - Resolves to master if product is merged
// - Validates integration status
// - Validates MarketplaceProduct isActive
```

---

## Validation Rules

### Integration Must Be Active

**Checks**:
1. `MarketplaceIntegration.isActive = true`
2. `MarketplaceIntegration.status = 'ACTIVE'`

**Result**: Only integrations that are both enabled and in active status are considered.

### MarketplaceProduct Must Be Active

**Checks**:
1. `MarketplaceProduct.isActive = true`
2. `MarketplaceProduct.integrationId` points to an active integration

**Result**: Only active marketplace product links are shown.

### Merged Products Resolution

**Logic**:
1. If `Product.mergedIntoProductId IS NOT NULL` → resolve to master product
2. Query marketplace links for master product
3. Return master's links for the merged product

**Result**: Merged products automatically show master product's marketplace links.

---

## Guarantees

### ✅ Visible Link = Real Integration

If a marketplace link icon is visible, it **guarantees**:
- ✅ `MarketplaceProduct` record exists and is linked to the product (or master if merged)
- ✅ `MarketplaceProduct.isActive = true`
- ✅ `MarketplaceIntegration.isActive = true`
- ✅ `MarketplaceIntegration.status = 'ACTIVE'`
- ✅ Integration is valid and operational

### ✅ No False Positives

- Inactive integrations are never shown
- Inactive marketplace product links are never shown
- Merged products automatically show master's links
- No UI decoration without real integration

### ✅ Merge Support

- When products are merged, marketplace links are automatically re-linked to master
- Merged products (inactive) show master product's marketplace links
- No broken links after merge operations

---

## Files Modified

1. **`backend/src/services/product.service.ts`**
   - Added `getMarketplaceLinksForProducts()` private method
   - Updated `getProducts()` to use new method
   - Updated `getProductById()` to use new method

---

## Testing Checklist

After implementation, verify:

- [ ] Active integrations show marketplace links
- [ ] Inactive integrations (`status != 'ACTIVE'`) don't show links
- [ ] Inactive `MarketplaceProduct` records don't show links
- [ ] Merged products show master product's marketplace links
- [ ] Merged products (inactive) still show master's links
- [ ] No marketplace links shown for products without `MarketplaceProduct` records
- [ ] Integration health is accurately reflected in UI

---

## Example Scenarios

### Scenario 1: Active Integration
```
Integration: { isActive: true, status: 'ACTIVE' }
MarketplaceProduct: { productId: 'prod-123', isActive: true }
Result: ✅ Link icon visible
```

### Scenario 2: Inactive Integration
```
Integration: { isActive: true, status: 'INACTIVE' }
MarketplaceProduct: { productId: 'prod-123', isActive: true }
Result: ❌ Link icon NOT visible (integration not active)
```

### Scenario 3: Inactive MarketplaceProduct
```
Integration: { isActive: true, status: 'ACTIVE' }
MarketplaceProduct: { productId: 'prod-123', isActive: false }
Result: ❌ Link icon NOT visible (marketplace product not active)
```

### Scenario 4: Merged Product
```
Product A: { id: 'prod-a', mergedIntoProductId: 'prod-master' }
Product Master: { id: 'prod-master' }
MarketplaceProduct: { productId: 'prod-master', isActive: true }
Integration: { isActive: true, status: 'ACTIVE' }

Query for Product A:
Result: ✅ Link icon visible (shows master's links)
```

---

## Implementation Status: ✅ COMPLETE

Marketplace links are now:
- ✅ Derived automatically from `MarketplaceProduct` records
- ✅ Validated for active integrations and active links
- ✅ Automatically resolved for merged products
- ✅ Guaranteed to represent real integration health

The system now ensures that visible marketplace link icons are a reliable indicator of actual integration status, not just UI decoration.

