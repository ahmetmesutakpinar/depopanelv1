# Product Resolver Architecture Design

**Version**: 1.0  
**Date**: 2024-12-XX  
**Status**: DESIGN PHASE - NO IMPLEMENTATION  
**Architect**: Senior WMS/ERP System Architect

---

## Executive Summary

This document defines the **Product Resolver** architecture that will serve as the **SINGLE SOURCE OF TRUTH** for product identity resolution across the entire WMS system. All product creation, matching, and resolution operations MUST flow through this resolver.

---

## 1️⃣ CORE PRINCIPLES

### 1.1 Identity Hierarchy (STRICT ORDER)

```
PRIMARY:   Barcode (EAN-13, UPC, GTIN, etc.)
           ↓ (if barcode missing or invalid)
SECONDARY: SKU (Stock Keeping Unit)
           ↓ (if SKU missing or invalid)
TERTIARY:  UNRESOLVED (requires manual intervention)
```

**Rules:**
- ✅ Barcode is **ALWAYS** checked first
- ✅ SKU is **ONLY** used when barcode is missing/null
- ✅ Marketplace Product IDs are **mappings only**, never identity
- ❌ Orders **MUST NEVER** create products directly
- ❌ CampaignSet **MUST NEVER** bypass resolver

### 1.2 Data Integrity Rules

1. **One Barcode = One Product**: A barcode MUST resolve to exactly ONE product per company
2. **Barcode Uniqueness**: Database constraint enforces `(companyId, barcode)` uniqueness (when barcode is NOT NULL)
3. **SKU Uniqueness**: Database constraint enforces `(companyId, sku)` uniqueness
4. **No Direct Creation**: All product creation MUST go through resolver validation

---

## 2️⃣ PRODUCT RESOLUTION DECISION TREE

### 2.1 Resolver Input Contract

```typescript
interface ProductResolverInput {
  // REQUIRED
  companyId: string;
  
  // IDENTIFIERS (at least one required)
  barcode?: string | null;
  sku?: string | null;
  
  // METADATA (for creation/validation)
  name?: string | null;
  marketplace?: MarketplaceType | null;
  marketplaceProductId?: string | null;
  
  // CONTEXT (for special handling)
  source: 'ORDER_IMPORT' | 'MARKETPLACE_SYNC' | 'MANUAL' | 'CAMPAIGNSET';
  campaignSetId?: string | null;
  
  // OPTIONS
  options?: {
    allowCreate?: boolean;        // Default: false for orders, true for manual
    strictBarcode?: boolean;      // Default: true - fail on duplicate barcode
    validateUniqueness?: boolean; // Default: true
  };
}
```

### 2.2 Resolver Output Contract

```typescript
interface ProductResolverResult {
  // RESOLUTION STATUS
  status: 'RESOLVED' | 'UNRESOLVED' | 'ERROR' | 'DUPLICATE_BARCODE';
  
  // RESOLVED PRODUCT (if status = RESOLVED)
  product?: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    companyId: string;
  };
  
  // RESOLUTION METHOD
  resolutionType: 'BARCODE_EXACT' | 'BARCODE_VARIANT' | 'SKU_EXACT' | 'SKU_CASE_INSENSITIVE' | 'CREATED' | 'NONE';
  
  // WARNINGS & ERRORS
  warnings: string[];
  errors: string[];
  
  // METADATA
  metadata: {
    matchedProductId?: string;
    duplicateBarcodeProducts?: string[]; // Product IDs with same barcode
    resolutionTime: number; // milliseconds
    queriesExecuted: number;
  };
}
```

### 2.3 Step-by-Step Resolution Flow

#### STEP 1: Input Validation & Normalization

```
1.1 Validate companyId exists
    → If invalid: Return ERROR status

1.2 Normalize barcode
    → Trim whitespace
    → Convert empty string to null
    → Validate format (if applicable)
    → Store as: normalizedBarcode

1.3 Normalize SKU
    → Trim whitespace
    → Convert empty string to null
    → Store as: normalizedSku

1.4 Validate at least one identifier exists
    → If both barcode and SKU are null: Return ERROR status
    → Error: "Either barcode or SKU must be provided"
```

**Data Queried**: None  
**State Returned**: Normalized input or ERROR

---

#### STEP 2: Barcode Resolution (PRIMARY PATH)

```
2.1 Check if normalizedBarcode is provided
    → If null/empty: Skip to STEP 3 (SKU Resolution)
    → If provided: Continue to 2.2

2.2 Query: Find products by barcode (companyId, normalizedBarcode)
    Query: SELECT * FROM products 
           WHERE companyId = ? AND barcode = ?
    
    → Result: products[]

2.3 Analyze barcode query results:
    
    CASE A: products.length === 0
        → No product found with this barcode
        → Continue to STEP 3 (SKU Resolution)
        → Note: Will create new product if SKU also doesn't match
    
    CASE B: products.length === 1
        → EXACT MATCH FOUND
        → Return RESOLVED status
        → resolutionType = 'BARCODE_EXACT'
        → product = products[0]
        → STOP resolution (do not check SKU)
    
    CASE C: products.length > 1
        → DATA INTEGRITY ERROR: Duplicate barcodes exist
        → Return ERROR status
        → status = 'DUPLICATE_BARCODE'
        → errors = ["Multiple products found with barcode: {barcode}"]
        → metadata.duplicateBarcodeProducts = products[].id
        → STOP resolution (requires manual fix)
```

**Data Queried**: Products table filtered by (companyId, barcode)  
**State Returned**: RESOLVED (exact match) | ERROR (duplicate) | Continue to SKU

---

#### STEP 3: SKU Resolution (SECONDARY PATH)

```
3.1 Check if normalizedSku is provided
    → If null/empty: Skip to STEP 4 (Unresolved)
    → If provided: Continue to 3.2

3.2 Query: Find products by SKU (case-insensitive)
    Query: SELECT * FROM products 
           WHERE companyId = ? AND LOWER(sku) = LOWER(?)
    
    → Result: products[]

3.3 Analyze SKU query results:
    
    CASE A: products.length === 0
        → No product found with this SKU
        → Continue to STEP 4 (Unresolved/Creation)
    
    CASE B: products.length === 1
        → EXACT MATCH FOUND
        → Check if this product has a different barcode:
            → If product.barcode !== null AND product.barcode !== normalizedBarcode
                → WARNING: SKU match but barcode mismatch
                → warnings = ["Product matched by SKU but barcode differs"]
                → Note: This indicates data quality issue
        → Return RESOLVED status
        → resolutionType = 'SKU_CASE_INSENSITIVE' (or 'SKU_EXACT' if case matches)
        → product = products[0]
        → STOP resolution
    
    CASE C: products.length > 1
        → DATA INTEGRITY ERROR: Duplicate SKUs exist (should not happen due to DB constraint)
        → Return ERROR status
        → errors = ["Multiple products found with SKU: {sku}"]
        → STOP resolution
```

**Data Queried**: Products table filtered by (companyId, sku) case-insensitive  
**State Returned**: RESOLVED (SKU match) | ERROR (duplicate SKU) | Continue to Unresolved

---

#### STEP 4: Unresolved Product Handling

```
4.1 Check if product creation is allowed
    → Check input.options.allowCreate
    → Check input.source:
        - 'ORDER_IMPORT': allowCreate = false (STRICT)
        - 'MARKETPLACE_SYNC': allowCreate = false (STRICT)
        - 'MANUAL': allowCreate = true
        - 'CAMPAIGNSET': allowCreate = false (must resolve existing)
    
    → If allowCreate = false: Continue to 4.2 (Unresolved)
    → If allowCreate = true: Continue to 4.3 (Creation)

4.2 UNRESOLVED (Creation Not Allowed)
    → Return UNRESOLVED status
    → status = 'UNRESOLVED'
    → resolutionType = 'NONE'
    → warnings = ["Product could not be resolved and creation is not allowed"]
    → errors = [] (not an error, just unresolved)
    → STOP resolution

4.3 CREATION (Creation Allowed)
    → Validate barcode uniqueness BEFORE creating:
        → If normalizedBarcode is provided:
            → Query: SELECT COUNT(*) FROM products 
                     WHERE companyId = ? AND barcode = ?
            → If count > 0: Return ERROR (should not happen, but defensive check)
    
    → Validate SKU uniqueness BEFORE creating:
        → Query: SELECT COUNT(*) FROM products 
                 WHERE companyId = ? AND sku = ?
        → If count > 0: Return ERROR (should not happen, but defensive check)
    
    → Create new product:
        → Use productRepository.create()
        → Set barcode = normalizedBarcode (may be null)
        → Set sku = normalizedSku (required)
        → Set name = input.name || "Unnamed Product"
        → Set companyId = input.companyId
        → Set isActive = true
        → Set default values (price=0, taxRate=20, etc.)
    
    → Return RESOLVED status
    → status = 'RESOLVED'
    → resolutionType = 'CREATED'
    → product = newly created product
    → warnings = ["New product created during resolution"]
    → STOP resolution
```

**Data Queried**: 
- Products table (uniqueness checks)
- Product creation via repository

**State Returned**: 
- UNRESOLVED (if creation not allowed)
- RESOLVED (if created)
- ERROR (if uniqueness check fails)

---

### 2.4 Complete Resolution Flow Diagram

```
START
  ↓
[STEP 1: Validate & Normalize Input]
  ↓ (if valid)
[STEP 2: Barcode Resolution]
  ├─→ [0 matches] → Continue to SKU
  ├─→ [1 match] → ✅ RESOLVED (BARCODE_EXACT)
  └─→ [>1 matches] → ❌ ERROR (DUPLICATE_BARCODE)
  ↓ (if barcode null or 0 matches)
[STEP 3: SKU Resolution]
  ├─→ [0 matches] → Continue to Unresolved
  ├─→ [1 match] → ✅ RESOLVED (SKU_*)
  └─→ [>1 matches] → ❌ ERROR (DUPLICATE_SKU)
  ↓ (if SKU null or 0 matches)
[STEP 4: Unresolved Handling]
  ├─→ [allowCreate = false] → ⚠️ UNRESOLVED
  └─→ [allowCreate = true] → ✅ RESOLVED (CREATED)
END
```

---

## 3️⃣ UNRESOLVED PRODUCT STRATEGY

### 3.1 Policy: Orders Must NOT Create Products

**Rule**: When `source = 'ORDER_IMPORT'`, product creation is **FORBIDDEN**.

**Rationale:**
- Orders represent transactions, not product definitions
- Product data should be defined BEFORE orders arrive
- Prevents data quality issues from marketplace errors

### 3.2 Unresolved Product Handling in Orders

#### Order Import Behavior

```
IF ProductResolver returns UNRESOLVED:
  1. Order is SAVED with unresolved product reference
  2. Order status = 'PENDING_RESOLUTION' (new status)
  3. OrderItem.productId = NULL (nullable)
  4. OrderItem.sku = original SKU (preserved)
  5. OrderItem.barcode = original barcode (preserved)
  6. OrderItem.name = original name (preserved)
  7. Stock movement = BLOCKED (no stock operations)
  8. Order cannot proceed to picking/shipping
  9. Admin notification sent
```

#### Order Status Flow

```
PENDING_RESOLUTION → (after manual product creation) → READY_TO_PICK
```

#### Stock Movement Policy

```
IF OrderItem.productId = NULL:
  → Stock operations BLOCKED
  → Stock logs NOT created
  → Warehouse operations SKIPPED
  → Error logged: "Cannot process stock for unresolved product"
```

### 3.3 Resolution Workflow

#### Step 1: Detection
- Admin dashboard shows "Unresolved Products" queue
- Lists all orders with unresolved products
- Shows: Order ID, SKU, Barcode, Name, Marketplace

#### Step 2: Manual Resolution
- Admin creates product manually (via Product Resolver)
- System automatically links unresolved orders to new product
- Orders status updated: PENDING_RESOLUTION → READY_TO_PICK

#### Step 3: Automatic Linking
```
WHEN Product is created/resolved:
  → Query: Find all OrderItems with matching (sku OR barcode)
  → Update: OrderItem.productId = newProduct.id
  → Update: Order.status = 'READY_TO_PICK' (if all items resolved)
```

### 3.4 Unresolved Product Data Model

**OrderItem Schema Changes (Future):**
```prisma
model OrderItem {
  // ... existing fields
  productId      String?  // NULLABLE - null if unresolved
  unresolvedSku  String?  // Preserved SKU if productId is null
  unresolvedBarcode String? // Preserved barcode if productId is null
  unresolvedName String?  // Preserved name if productId is null
}
```

**Order Status Enum Addition:**
```prisma
enum OrderStatus {
  // ... existing
  PENDING_RESOLUTION  // New status for unresolved products
}
```

---

## 4️⃣ CAMPAIGNSET INTEGRATION

### 4.1 Core Rule: CampaignSet MUST Use Resolver

**MANDATORY**: CampaignSet logic **MUST NEVER** bypass Product Resolver.

### 4.2 CampaignSet Resolution Flow

```
STEP 1: Check if SKU matches CampaignSet
  → Query: SELECT * FROM campaignSets 
           WHERE companyId = ? AND sku = ? AND isActive = true
  → Result: campaignSet | null

STEP 2: If CampaignSet found:
  → CampaignSet provides METADATA only:
     - Default name
     - Default price
     - Bundle information
     - Type = 'SET'
  
  → CampaignSet does NOT provide identity
  → Identity MUST still be resolved via Product Resolver

STEP 3: Call Product Resolver with CampaignSet context
  → Input:
     - companyId
     - barcode (from order item)
     - sku (from order item)
     - source = 'CAMPAIGNSET'
     - campaignSetId = campaignSet.id
     - name = campaignSet.name (as default)
     - allowCreate = false (STRICT - must resolve existing)

STEP 4: Product Resolver executes normal flow
  → Barcode resolution (PRIMARY)
  → SKU resolution (SECONDARY)
  → If unresolved: Return UNRESOLVED (do not create)

STEP 5: If resolved:
  → Link product to CampaignSet:
     - Update: product.campaignSetId = campaignSet.id
     - Update: product.type = 'SET' (if not already)
     - Update: product.name = campaignSet.name (if product name is generic)
     - Update: product.price = campaignSet.price (if product price is 0)
```

### 4.3 CampaignSet Bypass Prevention

**Current Problem:**
```typescript
// ❌ WRONG: Direct creation bypasses resolver
if (campaignSet) {
  product = await prisma.product.create({ ... });
}
```

**Correct Implementation:**
```typescript
// ✅ CORRECT: Always use resolver
if (campaignSet) {
  const resolverResult = await productResolver.resolve({
    companyId,
    barcode: item.barcode,
    sku: item.sku,
    source: 'CAMPAIGNSET',
    campaignSetId: campaignSet.id,
    name: campaignSet.name,
    allowCreate: false, // Must resolve existing
  });
  
  if (resolverResult.status === 'RESOLVED') {
    // Link to CampaignSet
    await linkProductToCampaignSet(resolverResult.product.id, campaignSet.id);
  } else {
    // Handle unresolved
  }
}
```

### 4.4 CampaignSet Metadata Application

**When to Apply CampaignSet Data:**
- ✅ After product is resolved (not before)
- ✅ Only if product data is missing/generic
- ✅ Never overwrite existing product data

**Application Rules:**
```
IF product.name === "Unnamed Product" OR product.name === product.sku:
  → Update: product.name = campaignSet.name

IF product.price === 0:
  → Update: product.price = campaignSet.price

IF product.type !== 'SET':
  → Update: product.type = 'SET'
  → Update: product.campaignSetId = campaignSet.id
```

---

## 5️⃣ FAILURE & EDGE CASES

### 5.1 Duplicate Barcode Already in DB

**Scenario**: Database contains multiple products with same barcode (legacy data)

**Behavior:**
```
STEP 2.3 (Barcode Resolution) detects duplicates
  → status = 'DUPLICATE_BARCODE'
  → errors = ["Multiple products found with barcode: {barcode}"]
  → metadata.duplicateBarcodeProducts = [id1, id2, ...]
  → Resolution STOPS

Action Required:
  → Admin must manually merge/delete duplicate products
  → System provides merge tool
  → After merge, resolution can proceed
```

**Prevention:**
- Database migration adds unique constraint
- Existing duplicates must be resolved before migration
- Application-level validation prevents new duplicates

### 5.2 Barcode = NULL

**Scenario**: Product has no barcode (barcode is null)

**Behavior:**
```
STEP 2.1: normalizedBarcode is null
  → Skip STEP 2 (Barcode Resolution)
  → Continue to STEP 3 (SKU Resolution)
  → If SKU matches: RESOLVED (SKU_*)
  → If SKU doesn't match: Continue to STEP 4 (Unresolved/Creation)
```

**Policy:**
- ✅ NULL barcode is valid (not an error)
- ✅ Resolution falls back to SKU
- ✅ New products can be created with NULL barcode

### 5.3 Barcode Changes Between Imports

**Scenario**: Same product, different barcode in different orders

**Example:**
- Order 1: SKU="ABC", Barcode="123"
- Order 2: SKU="ABC", Barcode="456" (barcode changed)

**Behavior:**
```
Order 1 Import:
  → Resolves by barcode "123" → Product A
  → Links OrderItem to Product A

Order 2 Import:
  → STEP 2: Barcode "456" not found
  → STEP 3: SKU "ABC" matches Product A
  → WARNING: "Product matched by SKU but barcode differs"
  → RESOLVED (SKU_CASE_INSENSITIVE)
  → Links OrderItem to Product A (same product)
  → Does NOT update Product A.barcode (preserves original)
```

**Policy:**
- ✅ SKU match takes precedence when barcode differs
- ⚠️ Warning logged for data quality review
- ❌ Product barcode is NOT updated automatically
- 📝 Admin can manually update if needed

### 5.4 Same Barcode, Different SKU

**Scenario**: Two orders with same barcode but different SKUs

**Example:**
- Order 1: SKU="ABC", Barcode="123"
- Order 2: SKU="XYZ", Barcode="123"

**Behavior:**
```
Order 1 Import:
  → Resolves by barcode "123" → Product A (SKU="ABC")
  → Creates Product A with barcode="123", sku="ABC"

Order 2 Import:
  → STEP 2: Barcode "123" matches Product A
  → RESOLVED (BARCODE_EXACT)
  → Links OrderItem to Product A (same product)
  → WARNING: "Order SKU 'XYZ' differs from product SKU 'ABC'"
  → OrderItem.sku preserved as "XYZ" (for reference)
  → Product A.sku remains "ABC" (not updated)
```

**Policy:**
- ✅ Barcode is PRIMARY identity (takes precedence)
- ⚠️ SKU mismatch logged as warning
- ❌ Product SKU is NOT updated automatically
- 📝 Admin can review and update if needed

### 5.5 Legacy Duplicate Products

**Scenario**: Database already contains duplicate products (pre-resolver)

**Migration Strategy:**
```
PHASE 1: Detection
  → Query: Find all duplicate barcodes
  → Report: List of duplicate groups
  → Status: Products marked as "NEEDS_MERGE"

PHASE 2: Manual Resolution
  → Admin reviews duplicates
  → Admin selects "master" product
  → Admin merges data (stock, orders, etc.)

PHASE 3: Cleanup
  → Delete duplicate products
  → Verify uniqueness

PHASE 4: Constraint Application
  → Add database unique constraint
  → Verify no violations
```

**During Resolution:**
- If duplicates detected: Return ERROR
- Admin must resolve before resolution can proceed
- System provides merge tools

---

## 6️⃣ CONTRACT & OUTPUT

### 6.1 ProductResolverService Interface

```typescript
class ProductResolverService {
  /**
   * Resolve product identity from identifiers
   * 
   * @param input - Product resolution input
   * @returns ProductResolverResult
   */
  async resolve(input: ProductResolverInput): Promise<ProductResolverResult>;
  
  /**
   * Check if barcode is unique (validation helper)
   * 
   * @param companyId - Company ID
   * @param barcode - Barcode to check
   * @param excludeProductId - Product ID to exclude from check
   * @returns true if unique, false if duplicate exists
   */
  async isBarcodeUnique(
    companyId: string, 
    barcode: string, 
    excludeProductId?: string
  ): Promise<boolean>;
  
  /**
   * Find unresolved products in orders
   * 
   * @param companyId - Company ID
   * @returns List of unresolved order items
   */
  async findUnresolvedProducts(companyId: string): Promise<UnresolvedProduct[]>;
  
  /**
   * Link unresolved orders to newly created product
   * 
   * @param productId - Product ID
   * @param identifiers - Identifiers to match (sku, barcode)
   */
  async linkUnresolvedOrders(
    productId: string, 
    identifiers: { sku?: string; barcode?: string }
  ): Promise<void>;
}
```

### 6.2 Resolution Result Types

```typescript
type ResolutionStatus = 
  | 'RESOLVED'           // Product found or created
  | 'UNRESOLVED'         // Product not found, creation not allowed
  | 'ERROR'              // System error
  | 'DUPLICATE_BARCODE'  // Multiple products with same barcode
  | 'DUPLICATE_SKU';     // Multiple products with same SKU

type ResolutionType =
  | 'BARCODE_EXACT'           // Matched by exact barcode
  | 'BARCODE_VARIANT'         // Matched by barcode variant (future)
  | 'SKU_EXACT'               // Matched by exact SKU
  | 'SKU_CASE_INSENSITIVE'    // Matched by SKU (case-insensitive)
  | 'CREATED'                 // New product created
  | 'NONE';                   // No resolution
```

### 6.3 Example Resolution Results

#### Example 1: Barcode Exact Match
```json
{
  "status": "RESOLVED",
  "product": {
    "id": "prod-123",
    "sku": "ABC-001",
    "barcode": "1234567890123",
    "name": "Product Name",
    "companyId": "comp-456"
  },
  "resolutionType": "BARCODE_EXACT",
  "warnings": [],
  "errors": [],
  "metadata": {
    "matchedProductId": "prod-123",
    "resolutionTime": 15,
    "queriesExecuted": 1
  }
}
```

#### Example 2: SKU Match with Barcode Mismatch
```json
{
  "status": "RESOLVED",
  "product": {
    "id": "prod-123",
    "sku": "ABC-001",
    "barcode": "1234567890123",
    "name": "Product Name",
    "companyId": "comp-456"
  },
  "resolutionType": "SKU_CASE_INSENSITIVE",
  "warnings": [
    "Product matched by SKU but barcode differs. Input barcode: '9876543210987', Product barcode: '1234567890123'"
  ],
  "errors": [],
  "metadata": {
    "matchedProductId": "prod-123",
    "resolutionTime": 25,
    "queriesExecuted": 2
  }
}
```

#### Example 3: Unresolved (Order Import)
```json
{
  "status": "UNRESOLVED",
  "product": null,
  "resolutionType": "NONE",
  "warnings": [
    "Product could not be resolved and creation is not allowed for ORDER_IMPORT source"
  ],
  "errors": [],
  "metadata": {
    "resolutionTime": 30,
    "queriesExecuted": 2
  }
}
```

#### Example 4: Duplicate Barcode Error
```json
{
  "status": "DUPLICATE_BARCODE",
  "product": null,
  "resolutionType": "NONE",
  "warnings": [],
  "errors": [
    "Multiple products found with barcode: '1234567890123'. Product IDs: ['prod-123', 'prod-456', 'prod-789']"
  ],
  "metadata": {
    "duplicateBarcodeProducts": ["prod-123", "prod-456", "prod-789"],
    "resolutionTime": 12,
    "queriesExecuted": 1
  }
}
```

---

## 7️⃣ ASSUMPTIONS & TODOS

### 7.1 Assumptions

1. **Database Constraints**: 
   - ✅ SKU uniqueness constraint exists: `@@unique([companyId, sku])`
   - ❌ Barcode uniqueness constraint will be added
   - ⚠️ Legacy duplicate barcodes must be resolved before constraint

2. **Product Lifecycle**:
   - Products are created BEFORE orders arrive (ideal)
   - Orders may reference products that don't exist yet (handled via UNRESOLVED)
   - Manual product creation is always allowed

3. **Barcode Format**:
   - Barcodes are stored as strings
   - Format validation is optional (EAN-13, UPC, etc.)
   - NULL barcode is valid

4. **Performance**:
   - Resolution queries are optimized with indexes
   - Barcode queries use index on `(companyId, barcode)`
   - SKU queries use index on `(companyId, sku)`

5. **Data Quality**:
   - Legacy data may contain duplicates (handled via ERROR status)
   - Admin tools provided for duplicate resolution
   - System prevents new duplicates

### 7.2 TODOs (Implementation Phase)

#### Phase 1: Database Changes
- [ ] Add unique constraint: `@@unique([companyId, barcode])` (nullable barcode handling)
- [ ] Add index on `(companyId, barcode)` for performance
- [ ] Add `OrderStatus.PENDING_RESOLUTION` enum value
- [ ] Make `OrderItem.productId` nullable
- [ ] Add `OrderItem.unresolvedSku`, `unresolvedBarcode`, `unresolvedName` fields

#### Phase 2: Repository Layer
- [ ] Add `existsByBarcode(companyId, barcode, excludeId?)` method
- [ ] Add `findByBarcode(companyId, barcode)` method (already exists, verify)
- [ ] Add `findDuplicatesByBarcode(companyId)` method
- [ ] Add `linkUnresolvedOrders(productId, identifiers)` method

#### Phase 3: Resolver Service
- [ ] Implement `ProductResolverService` class
- [ ] Implement resolution decision tree (STEP 1-4)
- [ ] Implement error handling
- [ ] Implement warning generation
- [ ] Add logging and metrics

#### Phase 4: Integration Points
- [ ] Replace `matchOrCreateProduct()` with `ProductResolverService.resolve()`
- [ ] Update `job-order-sync.ts` to use resolver
- [ ] Remove CampaignSet bypass in `job-order-sync.ts:706`
- [ ] Update `product.service.ts` to use resolver
- [ ] Update `product-set.service.ts` to use resolver

#### Phase 5: Unresolved Product Handling
- [ ] Implement unresolved product queue UI
- [ ] Implement automatic order linking when product created
- [ ] Implement order status updates
- [ ] Add admin notifications for unresolved products

#### Phase 6: Testing
- [ ] Unit tests for resolver decision tree
- [ ] Integration tests for order import with unresolved products
- [ ] Test duplicate barcode detection
- [ ] Test CampaignSet integration
- [ ] Test edge cases (null barcode, SKU mismatch, etc.)

#### Phase 7: Migration
- [ ] Script to detect duplicate barcodes
- [ ] Admin tool for duplicate resolution
- [ ] Migration script for existing unresolved orders
- [ ] Data validation before constraint application

---

## 8️⃣ DESIGN DECISIONS

### 8.1 Why Barcode is PRIMARY

**Rationale:**
- Barcodes are globally unique identifiers (EAN-13, UPC standards)
- Barcodes are physical labels on products
- Barcodes are scanned in warehouses (not SKUs)
- Barcodes are less likely to change than SKUs

**Trade-offs:**
- Some products may not have barcodes (handled via SKU fallback)
- Legacy data may have duplicate barcodes (handled via ERROR status)

### 8.2 Why Orders Don't Create Products

**Rationale:**
- Orders are transactions, not product definitions
- Product data should be defined before orders arrive
- Prevents data quality issues from marketplace errors
- Allows for product data validation before order processing

**Trade-offs:**
- Requires manual intervention for new products
- May delay order processing (handled via UNRESOLVED status)

### 8.3 Why CampaignSet Uses Resolver

**Rationale:**
- Maintains single source of truth
- Prevents duplicate products
- Ensures data integrity
- CampaignSet provides metadata, not identity

**Trade-offs:**
- Slightly more complex flow
- Requires CampaignSet products to exist before orders

---

## 9️⃣ SUMMARY

### Core Architecture

1. **Single Source of Truth**: `ProductResolverService` is the ONLY way to resolve product identity
2. **Identity Hierarchy**: Barcode → SKU → UNRESOLVED
3. **Strict Validation**: No creation during order import
4. **Data Integrity**: Duplicate detection and error reporting
5. **Unresolved Handling**: Orders saved with NULL productId, manual resolution required

### Key Files to Modify (Future)

- `backend/src/services/product-resolver.service.ts` (NEW)
- `backend/src/utils/job-order-sync.ts` (MODIFY - remove bypass)
- `backend/src/services/product-matcher.service.ts` (REPLACE with resolver)
- `backend/src/services/product.service.ts` (MODIFY - use resolver)
- `backend/src/repositories/product.repository.ts` (ADD methods)
- `backend/prisma/schema.prisma` (ADD constraints)

### Success Criteria

- ✅ No duplicate barcodes can be created
- ✅ All product resolution flows through resolver
- ✅ Orders with unresolved products are saved but blocked
- ✅ CampaignSet never bypasses resolver
- ✅ System provides clear errors and warnings

---

**END OF DESIGN DOCUMENT**

**Next Steps**: Review design, approve, then proceed to implementation phase.

