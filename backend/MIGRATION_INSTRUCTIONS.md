# Wave System Migration Instructions

## Prerequisites

The Order Wave system requires database schema updates. Follow these steps:

## Step 1: Generate Prisma Migration

```bash
cd backend
npx prisma migrate dev --name add_wave_system
```

This will:
1. Create a migration file with the new schema changes
2. Apply the migration to your database
3. Regenerate the Prisma client with new types

## Step 2: Verify Migration

After migration, verify that:
- `WaveType` enum exists
- `WaveStatus` enum exists
- `PickingWave` model has new fields:
  - `type: WaveType`
  - `status: WaveStatus`
  - `creationReason: String?`
  - `totalOrders: Int`
  - `totalItems: Int`
  - `hasStockIssue: Boolean`
  - `stockIssueNote: String?`
  - `createdBy: String?`
  - `rules: Json?`
  - `cutOffTime: DateTime?`
  - `closedAt: DateTime?`

## Step 3: Update Order Status Enum

The `OrderStatus` enum now includes `READY_TO_PICK`. Update existing orders if needed:

```sql
-- Optional: Update existing PENDING/PROCESSING orders to READY_TO_PICK
-- Only if you want to use the new status
UPDATE orders 
SET status = 'READY_TO_PICK' 
WHERE status IN ('PENDING', 'PROCESSING') 
  AND picking_wave_id IS NULL;
```

## Step 4: Test Wave Creation

Test the wave system with a simple manual wave:

```typescript
import { waveCreationService } from './services/wave-creation.service';

// Create a test wave
const result = await waveCreationService.createManualWave(
  companyId,
  warehouseId,
  [orderId1, orderId2],
  { priority: 0 }
);
```

## Step 5: Remove Type Assertions

After Prisma client regeneration, you can remove `as any` type assertions from:
- `backend/src/services/wave-creation.service.ts`
- `backend/src/services/picking-wave.service.ts`

## Notes

- The system is backward compatible with existing `PickingWave` records
- Old waves will have `status` as string (legacy)
- New waves will use `WaveStatus` enum
- The `type` field defaults to `MANUAL` for existing waves

