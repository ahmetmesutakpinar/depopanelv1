/**
 * Pick List Generation Service
 * 
 * Generates printable, mobile-friendly pick lists for waves.
 * Consolidates quantities per SKU and sorts by warehouse location.
 */

import { prisma } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';

export interface PickListItem {
  sku: string;
  productName: string;
  barcode: string | null;
  gtin: string | null;
  location: {
    code: string;
    zone?: string;
    aisle?: string;
    shelf?: string;
    bin?: string;
  } | null;
  totalQuantity: number;
  pickedQuantity: number;
  remainingQuantity: number;
  orders: Array<{
    orderNumber: string;
    customerName: string;
    quantity: number;
  }>;
}

export interface PickList {
  waveId: string;
  waveCode: string;
  warehouseId: string;
  warehouseName: string;
  status: string;
  createdAt: Date;
  totalOrders: number;
  totalItems: number;
  items: PickListItem[];
  sortedByLocation: boolean;
}

export class PickListService {
  /**
   * Generate pick list for a wave
   */
  async generatePickList(
    waveId: string,
    companyId: string,
    sortByLocation: boolean = true
  ): Promise<PickList> {
    const wave = await prisma.pickingWave.findFirst({
      where: {
        id: waveId,
        companyId,
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        orders: {
          where: {
            status: {
              not: 'SHIPPED',
            },
          },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                    gtin: true,
                  },
                },
                variant: {
                  select: {
                    id: true,
                    sku: true,
                    barcode: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!wave) {
      throw new AppError('Wave not found', 404);
    }

    // Get picked items from wave
    const pickedItems: Record<string, { pickedQty: number; lastScannedAt: string }> = 
      (wave.pickedItems as any) || {};

    // Aggregate items by SKU
    const aggregatedItems = new Map<string, PickListItem>();

    for (const order of wave.orders) {
      for (const item of order.items) {
        // Use SKU as primary key (same as wave aggregation logic)
        const sku = (item.sku || item.product?.sku || '').trim().toUpperCase();
        const key = `sku-${sku}-${item.variantId || 'no-variant'}`;

        if (!aggregatedItems.has(key)) {
          // Get location assignment for product
          const locationAssignment = await prisma.productLocationAssignment.findFirst({
            where: {
              productId: item.productId || '',
              variantId: item.variantId || null,
              isPrimary: true,
            },
            include: {
              location: true,
            },
          });

          const location = locationAssignment?.location;

          aggregatedItems.set(key, {
            sku: sku || item.sku,
            productName: item.name || item.product?.name || 'Unknown Product',
            barcode: item.product?.barcode || item.variant?.barcode || null,
            gtin: item.product?.gtin || null,
            location: location ? {
              code: location.code,
              zone: location.zone || undefined,
              aisle: location.aisle || undefined,
              shelf: location.shelf || undefined,
              bin: location.bin || undefined,
            } : null,
            totalQuantity: 0,
            pickedQuantity: pickedItems[key]?.pickedQty || 0,
            remainingQuantity: 0,
            orders: [],
          });
        }

        const aggregated = aggregatedItems.get(key)!;
        aggregated.totalQuantity += item.quantity;

        // Add order reference
        const existingOrder = aggregated.orders.find(o => o.orderNumber === order.orderNumber);
        if (existingOrder) {
          existingOrder.quantity += item.quantity;
        } else {
          aggregated.orders.push({
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            quantity: item.quantity,
          });
        }
      }
    }

    // Calculate remaining quantities
    const items: PickListItem[] = Array.from(aggregatedItems.values()).map(item => ({
      ...item,
      remainingQuantity: Math.max(0, item.totalQuantity - item.pickedQuantity),
    }));

    // Sort by location if requested
    if (sortByLocation) {
      items.sort((a, b) => {
        // Sort by zone, aisle, shelf, bin
        if (!a.location && !b.location) return 0;
        if (!a.location) return 1;
        if (!b.location) return -1;

        const aZone = a.location.zone || '';
        const bZone = b.location.zone || '';
        if (aZone !== bZone) return aZone.localeCompare(bZone);

        const aAisle = a.location.aisle || '';
        const bAisle = b.location.aisle || '';
        if (aAisle !== bAisle) return aAisle.localeCompare(bAisle);

        const aShelf = a.location.shelf || '';
        const bShelf = b.location.shelf || '';
        if (aShelf !== bShelf) return aShelf.localeCompare(bShelf);

        const aBin = a.location.bin || '';
        const bBin = b.location.bin || '';
        return aBin.localeCompare(bBin);
      });
    }

    logger.info(`[Pick List] Generated pick list for wave ${wave.code}`, {
      waveId: wave.id,
      totalItems: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.totalQuantity, 0),
      sortedByLocation: sortByLocation,
    });

    return {
      waveId: wave.id,
      waveCode: wave.code,
      warehouseId: wave.warehouseId,
      warehouseName: wave.warehouse.name,
      status: wave.status,
      createdAt: wave.createdAt,
      totalOrders: wave.orders.length,
      totalItems: items.length,
      items,
      sortedByLocation: sortByLocation,
    };
  }

  /**
   * Generate printable pick list (formatted for printing)
   */
  async generatePrintablePickList(
    waveId: string,
    companyId: string
  ): Promise<string> {
    const pickList = await this.generatePickList(waveId, companyId, true);

    // Format as printable text
    let output = `\n`;
    output += `═══════════════════════════════════════════════════════════\n`;
    output += `           PICK LIST - WAVE ${pickList.waveCode}\n`;
    output += `═══════════════════════════════════════════════════════════\n`;
    output += `\n`;
    output += `Warehouse: ${pickList.warehouseName}\n`;
    output += `Status: ${pickList.status}\n`;
    output += `Total Orders: ${pickList.totalOrders}\n`;
    output += `Total Items: ${pickList.totalItems}\n`;
    output += `Created: ${pickList.createdAt.toLocaleString()}\n`;
    output += `\n`;
    output += `═══════════════════════════════════════════════════════════\n`;
    output += `                         ITEMS\n`;
    output += `═══════════════════════════════════════════════════════════\n`;
    output += `\n`;

    for (let i = 0; i < pickList.items.length; i++) {
      const item = pickList.items[i];
      output += `${i + 1}. ${item.productName}\n`;
      output += `   SKU: ${item.sku}\n`;
      if (item.barcode) {
        output += `   Barcode: ${item.barcode}\n`;
      }
      if (item.gtin) {
        output += `   GTIN: ${item.gtin}\n`;
      }
      if (item.location) {
        output += `   Location: ${item.location.code}`;
        if (item.location.zone) output += ` (Zone: ${item.location.zone})`;
        if (item.location.aisle) output += ` Aisle: ${item.location.aisle}`;
        if (item.location.shelf) output += ` Shelf: ${item.location.shelf}`;
        if (item.location.bin) output += ` Bin: ${item.location.bin}`;
        output += `\n`;
      } else {
        output += `   Location: Not assigned\n`;
      }
      output += `   Quantity: ${item.pickedQuantity}/${item.totalQuantity} (${item.remainingQuantity} remaining)\n`;
      output += `   Orders: ${item.orders.map(o => `${o.orderNumber} (${o.quantity})`).join(', ')}\n`;
      output += `\n`;
    }

    output += `═══════════════════════════════════════════════════════════\n`;
    output += `\n`;

    return output;
  }

  /**
   * Generate mobile-friendly pick list (JSON format)
   */
  async generateMobilePickList(
    waveId: string,
    companyId: string
  ): Promise<any> {
    const pickList = await this.generatePickList(waveId, companyId, true);

    return {
      wave: {
        id: pickList.waveId,
        code: pickList.waveCode,
        status: pickList.status,
        warehouse: {
          id: pickList.warehouseId,
          name: pickList.warehouseName,
        },
      },
      summary: {
        totalOrders: pickList.totalOrders,
        totalItems: pickList.totalItems,
        totalQuantity: pickList.items.reduce((sum, item) => sum + item.totalQuantity, 0),
        pickedQuantity: pickList.items.reduce((sum, item) => sum + item.pickedQuantity, 0),
        remainingQuantity: pickList.items.reduce((sum, item) => sum + item.remainingQuantity, 0),
      },
      items: pickList.items.map(item => ({
        sku: item.sku,
        productName: item.productName,
        barcode: item.barcode,
        gtin: item.gtin,
        location: item.location,
        quantity: {
          total: item.totalQuantity,
          picked: item.pickedQuantity,
          remaining: item.remainingQuantity,
        },
        orders: item.orders,
      })),
    };
  }
}

export const pickListService = new PickListService();

