/**
 * Stock DTOs
 */

import { z } from 'zod';

/**
 * Adjust Stock DTO
 */
export const AdjustStockDTO = z.object({
  productId: z.string().uuid('Geçersiz ürün ID'),
  variantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid('Geçersiz depo ID'),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int('Miktar tam sayı olmalı'),
  note: z.string().optional(),
});

export type AdjustStockDTO = z.infer<typeof AdjustStockDTO>;

/**
 * Transfer Stock DTO
 */
export const TransferStockDTO = z.object({
  fromWarehouseId: z.string().uuid('Geçersiz kaynak depo ID'),
  toWarehouseId: z.string().uuid('Geçersiz hedef depo ID'),
  productId: z.string().uuid('Geçersiz ürün ID'),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive('Miktar pozitif olmalı'),
  note: z.string().optional(),
});

export type TransferStockDTO = z.infer<typeof TransferStockDTO>;

/**
 * Stock Query DTO
 */
export const StockQueryDTO = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  lowStock: z.boolean().optional(),
});

export type StockQueryDTO = z.infer<typeof StockQueryDTO>;

