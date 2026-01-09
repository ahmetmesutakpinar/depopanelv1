# Order Wave System Documentation

## Overview

The Order Wave (Wave Picking / Batch Processing) system groups orders into operational waves for efficient warehouse processing (pick → pack → ship).

## Core Concepts

### Wave Entity

A wave represents:
- A planned picking session
- A physical workflow in the warehouse
- A time-based or rule-based batch

### Wave Status Flow

```
CREATED → PICKING → PACKING → SHIPPED → CLOSED
   ↓         ↓         ↓         ↓
CANCELLED  EXCEPTION
```

- **CREATED**: Wave created, orders assigned
- **PICKING**: Currently being picked
- **PACKING**: Picked, being packed
- **SHIPPED**: All orders shipped
- **CLOSED**: Wave completed and closed
- **CANCELLED**: Wave cancelled
- **EXCEPTION**: Stock or other exception occurred

## Wave Types

### 1. TIME_BASED
Orders accumulated until a cut-off time (e.g., "Morning Wave" before 14:00).

### 2. SKU_BASED
Orders containing the same SKU are grouped for fast picking.

### 3. PRIORITY
Express/same-day shipping orders, marketplace SLA-driven (Amazon, etc.).

### 4. MANUAL
Admin manually selects orders and creates a wave.

### 5. MARKETPLACE
Orders grouped by marketplace (WooCommerce, Amazon, etc.).

### 6. SHIPPING
Orders grouped by shipping method/carrier (FBA, FBM, Standard, Express).

### 7. COUNTRY
Orders grouped by destination country.

### 8. MIXED
Multiple rules combined.

## Wave Creation Rules

### Mandatory Rules

1. **Order Status**: Must be `READY_TO_PICK` (or `PENDING`/`PROCESSING` if configured)
2. **Stock Availability**: All items must have sufficient stock (no backorders)

### Optional Grouping Rules

- **Marketplace**: Filter by marketplace type
- **Shipping Method**: FBA, FBM, Standard, Express
- **Carrier**: UPS, DHL, FedEx, etc.
- **Destination Country**: Filter by shipping country
- **Single-SKU vs Multi-SKU**: Filter by order complexity
- **Same SKU Consolidation**: Group orders with same SKU together
- **Cut-off Time**: Orders before specified time (HH:mm format)
- **Time Window**: Orders within time range
- **Priority Only**: Only express/same-day orders
- **SLA Driven**: Marketplace SLA-driven orders
- **SKU List**: Specific SKUs to include/exclude
- **Max/Min Orders**: Limit orders per wave

## Usage Examples

### Create Time-Based Wave

```typescript
import { waveCreationService } from './services/wave-creation.service';

// Morning wave (cut-off: 14:00)
await waveCreationService.createTimeBasedWave(
  companyId,
  warehouseId,
  '14:00', // Cut-off time
  {
    maxOrders: 50,
    minOrders: 5,
    priority: 0,
  }
);
```

### Create SKU-Based Wave

```typescript
// Group orders with same SKU
await waveCreationService.createSkuBasedWave(
  companyId,
  warehouseId,
  {
    maxOrders: 100,
    minOrders: 10,
    skuList: ['SKU-001', 'SKU-002'], // Optional: specific SKUs
  }
);
```

### Create Priority Wave

```typescript
// Express/same-day orders
await waveCreationService.createPriorityWave(
  companyId,
  warehouseId,
  {
    maxOrders: 30,
    minOrders: 1,
    priority: 10, // Higher priority
  }
);
```

### Create Manual Wave

```typescript
// Admin-selected orders
await waveCreationService.createManualWave(
  companyId,
  warehouseId,
  ['order-id-1', 'order-id-2', 'order-id-3'],
  {
    priority: 5,
    createdBy: userId,
  }
);
```

### Create Custom Wave with Rules

```typescript
import { waveRuleEngine } from './utils/wave-rule-engine';

const rules = {
  orderStatus: 'READY_TO_PICK',
  requireStockAvailable: true,
  marketplace: ['WOOCOMMERCE', 'AMAZON'],
  shippingMethod: ['EXPRESS', 'SAME_DAY'],
  destinationCountry: ['Türkiye'],
  maxOrdersPerWave: 50,
  minOrdersPerWave: 5,
  cutOffTime: '14:00',
};

const waves = await waveCreationService.createWaveAutomatically({
  companyId,
  warehouseId,
  type: 'MIXED',
  rules,
  maxOrdersPerWave: 50,
  minOrdersPerWave: 5,
  priority: 0,
  createdBy: 'system',
});
```

## Pick List Generation

### Generate Mobile-Friendly Pick List

```typescript
import { pickListService } from './services/pick-list.service';

const pickList = await pickListService.generateMobilePickList(waveId, companyId);
// Returns JSON with items sorted by location
```

### Generate Printable Pick List

```typescript
const printableList = await pickListService.generatePrintablePickList(waveId, companyId);
// Returns formatted text for printing
```

## Wave Status Transitions

### Start Picking

```typescript
await pickingWaveService.startWave(waveId, companyId);
// CREATED → PICKING
// Validates stock availability
```

### Transition to Packing

```typescript
await pickingWaveService.transitionToPacking(waveId, companyId);
// PICKING → PACKING
// Validates all items are picked
```

### Transition to Shipped

```typescript
await pickingWaveService.transitionToShipped(waveId, companyId);
// PACKING → SHIPPED
// Validates all orders are shipped
```

### Close Wave

```typescript
await pickingWaveService.closeWave(waveId, companyId);
// SHIPPED → CLOSED
```

## Safety & Integrity Rules

### Order Cancellation Handling

When an order is cancelled, it's automatically removed from the wave:

```typescript
await waveCreationService.handleOrderCancellation(orderId, companyId);
```

### Stock Exception Detection

Check and flag stock exceptions in a wave:

```typescript
await waveCreationService.checkStockExceptions(waveId, companyId);
// Sets hasStockIssue flag if stock is insufficient
```

### Order Uniqueness

- An order can belong to only one active wave
- If an order is already in a wave, it cannot be added to another

## Logging & Diagnostics

All wave operations are logged with detailed information:

```
[Wave Creation] Order #12345 added to Wave #W-2025-001
  Reason: Same SKU + Standard Shipping
  OrderId: abc-123
  WaveId: wave-456
```

### Log Categories

- **Wave Creation**: Why orders entered/excluded from waves
- **Status Transitions**: Wave status changes
- **Stock Issues**: Stock availability problems
- **Order Assignments**: Orders added/removed from waves

## Database Schema

### PickingWave Model

```prisma
model PickingWave {
  id              String          @id @default(uuid())
  code            String          // WAVE-20250101-0001
  warehouseId     String
  strategy        PickingStrategy
  type            WaveType       // TIME_BASED, SKU_BASED, etc.
  status          WaveStatus      // CREATED, PICKING, etc.
  priority        Int
  creationReason  String?         // Rule-based description
  totalOrders     Int
  totalItems      Int
  hasStockIssue   Boolean
  stockIssueNote  String?
  createdBy       String?         // 'system' or userId
  rules           Json?           // Rules that created this wave
  cutOffTime      DateTime?
  // ... relations
}
```

## API Endpoints (To Be Implemented)

### Wave Management

- `POST /api/waves` - Create wave (manual or automatic)
- `GET /api/waves` - List waves with filters
- `GET /api/waves/:id` - Get wave details
- `PUT /api/waves/:id/start` - Start picking
- `PUT /api/waves/:id/packing` - Transition to packing
- `PUT /api/waves/:id/shipped` - Transition to shipped
- `PUT /api/waves/:id/close` - Close wave
- `DELETE /api/waves/:id` - Delete wave

### Pick Lists

- `GET /api/waves/:id/pick-list` - Get pick list (mobile format)
- `GET /api/waves/:id/pick-list/print` - Get printable pick list

### Wave Creation

- `POST /api/waves/auto/time-based` - Create time-based wave
- `POST /api/waves/auto/sku-based` - Create SKU-based wave
- `POST /api/waves/auto/priority` - Create priority wave
- `POST /api/waves/auto/custom` - Create wave with custom rules

## Best Practices

1. **Stock Validation**: Always validate stock before creating waves
2. **Order Status**: Use `READY_TO_PICK` status for orders ready for picking
3. **Wave Size**: Limit waves to manageable sizes (50-100 orders)
4. **Location Sorting**: Always sort pick lists by location for efficiency
5. **Exception Handling**: Monitor `hasStockIssue` flag and resolve quickly
6. **Logging**: Review logs regularly to understand wave creation patterns

## Future Enhancements

- Zone-based picking optimization
- Multi-warehouse wave support
- Wave scheduling (cron-based automatic creation)
- Performance metrics and analytics
- Mobile app integration for real-time picking

