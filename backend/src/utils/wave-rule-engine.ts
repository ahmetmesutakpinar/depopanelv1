/**
 * Wave Rule Engine
 * 
 * Configurable rule engine for creating order waves based on operational criteria.
 * Supports multiple wave types and grouping strategies.
 */

import { Order, OrderItem, OrderSource, MarketplaceIntegration } from '@prisma/client';
import { prisma } from '../config/index.js';
import { logger } from './logger.js';

export type WaveType = 'TIME_BASED' | 'SKU_BASED' | 'PRIORITY' | 'MANUAL' | 'MARKETPLACE' | 'SHIPPING' | 'COUNTRY' | 'MIXED';

export interface WaveRule {
  // Mandatory rules
  orderStatus?: 'READY_TO_PICK' | 'PENDING' | 'PROCESSING'; // Default: READY_TO_PICK
  requireStockAvailable?: boolean; // Default: true - no backorders
  
  // Optional grouping rules
  marketplace?: string[]; // Filter by marketplace type (WOOCOMMERCE, AMAZON, etc.)
  shippingMethod?: string[]; // FBA, FBM, Standard, Express, etc.
  carrier?: string[]; // UPS, DHL, FedEx, etc.
  destinationCountry?: string[]; // Filter by shipping country
  singleSkuOnly?: boolean; // Only single-SKU orders
  multiSkuOnly?: boolean; // Only multi-SKU orders
  sameSkuConsolidation?: boolean; // Group orders with same SKU together
  maxOrdersPerWave?: number; // Maximum orders in a wave
  minOrdersPerWave?: number; // Minimum orders to create a wave
  
  // Time-based rules
  cutOffTime?: string; // HH:mm format (e.g., "14:00")
  timeWindow?: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  
  // Priority rules
  priorityOnly?: boolean; // Only express/same-day orders
  slaDriven?: boolean; // Marketplace SLA-driven (Amazon, etc.)
  
  // SKU-based rules
  skuList?: string[]; // Specific SKUs to include
  excludeSkuList?: string[]; // SKUs to exclude
  
  // Warehouse rules
  warehouseId?: string; // Specific warehouse
}

export interface WaveRuleResult {
  eligible: boolean;
  reason?: string;
  matchedRules: string[];
  excludedReason?: string;
}

export interface OrderWithDetails extends Order {
  items: OrderItem[];
  orderSources: (OrderSource & {
    integration: MarketplaceIntegration | null;
  })[];
  integration?: MarketplaceIntegration | null;
}

/**
 * Check if an order matches wave creation rules
 */
export class WaveRuleEngine {
  /**
   * Evaluate if an order is eligible for wave creation
   */
  async evaluateOrder(
    order: OrderWithDetails,
    rules: WaveRule,
    companyId: string
  ): Promise<WaveRuleResult> {
    const matchedRules: string[] = [];
    const excludedReasons: string[] = [];

    // 1. MANDATORY: Order status check
    const requiredStatus = rules.orderStatus || 'READY_TO_PICK';
    
    // Eski sistem uyumluluğu: READY_TO_PICK için PENDING ve PROCESSING'i de kabul et
    let statusMatches = false;
    if (requiredStatus === 'READY_TO_PICK') {
      // READY_TO_PICK için PENDING, PROCESSING ve READY_TO_PICK'i kabul et
      statusMatches = order.status === 'PENDING' || order.status === 'PROCESSING' || order.status === 'READY_TO_PICK';
    } else {
      // Diğer durumlarda exact match
      statusMatches = order.status === requiredStatus;
    }
    
    if (!statusMatches) {
      excludedReasons.push(`Order status is ${order.status}, required: ${requiredStatus}`);
      return {
        eligible: false,
        reason: `Order status mismatch: ${order.status} (required: ${requiredStatus})`,
        matchedRules: [],
        excludedReason: excludedReasons.join('; '),
      };
    }
    matchedRules.push(`Status: ${order.status}`);

    // 2. MANDATORY: Stock availability check
    if (rules.requireStockAvailable !== false) {
      const stockCheck = await this.checkStockAvailability(order, companyId);
      if (!stockCheck.available) {
        excludedReasons.push(`Stock unavailable: ${stockCheck.reason}`);
        return {
          eligible: false,
          reason: stockCheck.reason,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push('Stock available');
    }

    // 3. Check if order is already in a wave
    if (order.pickingWaveId) {
      excludedReasons.push(`Order already in wave: ${order.pickingWaveId}`);
      return {
        eligible: false,
        reason: `Order already assigned to wave`,
        matchedRules: [],
        excludedReason: excludedReasons.join('; '),
      };
    }

    // 4. OPTIONAL: Marketplace filter
    if (rules.marketplace && rules.marketplace.length > 0) {
      const orderMarketplace = order.integration?.type || 
                               order.orderSources?.[0]?.integration?.type;
      if (!orderMarketplace || !rules.marketplace.includes(orderMarketplace)) {
        excludedReasons.push(`Marketplace mismatch: ${orderMarketplace} (required: ${rules.marketplace.join(', ')})`);
        return {
          eligible: false,
          reason: `Marketplace filter: ${orderMarketplace} not in ${rules.marketplace.join(', ')}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Marketplace: ${orderMarketplace}`);
    }

    // 5. OPTIONAL: Shipping method filter
    if (rules.shippingMethod && rules.shippingMethod.length > 0) {
      const shippingMethod = order.orderSources?.[0]?.shippingProvider || 
                            order.shippingProvider || 
                            'STANDARD';
      if (!rules.shippingMethod.includes(shippingMethod.toUpperCase())) {
        excludedReasons.push(`Shipping method mismatch: ${shippingMethod}`);
        return {
          eligible: false,
          reason: `Shipping method filter: ${shippingMethod} not in ${rules.shippingMethod.join(', ')}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Shipping: ${shippingMethod}`);
    }

    // 6. OPTIONAL: Carrier filter
    if (rules.carrier && rules.carrier.length > 0) {
      const carrier = order.cargoCompanyId 
        ? (await prisma.cargoCompany.findUnique({ where: { id: order.cargoCompanyId } }))?.code
        : null;
      if (!carrier || !rules.carrier.includes(carrier.toUpperCase())) {
        excludedReasons.push(`Carrier mismatch: ${carrier || 'none'}`);
        return {
          eligible: false,
          reason: `Carrier filter: ${carrier || 'none'} not in ${rules.carrier.join(', ')}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Carrier: ${carrier}`);
    }

    // 7. OPTIONAL: Destination country filter
    if (rules.destinationCountry && rules.destinationCountry.length > 0) {
      const country = order.shippingCountry || 'Türkiye';
      if (!rules.destinationCountry.includes(country)) {
        excludedReasons.push(`Country mismatch: ${country}`);
        return {
          eligible: false,
          reason: `Country filter: ${country} not in ${rules.destinationCountry.join(', ')}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Country: ${country}`);
    }

    // 8. OPTIONAL: Single-SKU vs Multi-SKU filter
    const itemCount = order.items?.length || 0;
    if (rules.singleSkuOnly && itemCount !== 1) {
      excludedReasons.push(`Not single-SKU order (${itemCount} items)`);
      return {
        eligible: false,
        reason: `Single-SKU filter: order has ${itemCount} items`,
        matchedRules: [],
        excludedReason: excludedReasons.join('; '),
      };
    }
    if (rules.multiSkuOnly && itemCount <= 1) {
      excludedReasons.push(`Not multi-SKU order (${itemCount} items)`);
      return {
        eligible: false,
        reason: `Multi-SKU filter: order has ${itemCount} items`,
        matchedRules: [],
        excludedReason: excludedReasons.join('; '),
      };
    }
    if (itemCount === 1) {
      matchedRules.push('Single-SKU order');
    } else {
      matchedRules.push(`Multi-SKU order (${itemCount} items)`);
    }

    // 9. OPTIONAL: SKU list filter
    if (rules.skuList && rules.skuList.length > 0) {
      const orderSkus = order.items?.map(item => item.sku.toUpperCase()) || [];
      const hasMatchingSku = orderSkus.some(sku => 
        rules.skuList!.some(ruleSku => ruleSku.toUpperCase() === sku)
      );
      if (!hasMatchingSku) {
        excludedReasons.push(`No matching SKU in order (${orderSkus.join(', ')})`);
        return {
          eligible: false,
          reason: `SKU filter: order SKUs ${orderSkus.join(', ')} not in ${rules.skuList.join(', ')}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`SKU match: ${orderSkus.join(', ')}`);
    }

    // 10. OPTIONAL: Exclude SKU list
    if (rules.excludeSkuList && rules.excludeSkuList.length > 0) {
      const orderSkus = order.items?.map(item => item.sku.toUpperCase()) || [];
      const hasExcludedSku = orderSkus.some(sku => 
        rules.excludeSkuList!.some(excludeSku => excludeSku.toUpperCase() === sku)
      );
      if (hasExcludedSku) {
        excludedReasons.push(`Contains excluded SKU`);
        return {
          eligible: false,
          reason: `Exclude SKU filter: order contains excluded SKU`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
    }

    // 11. OPTIONAL: Time window check
    if (rules.timeWindow) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentTime < rules.timeWindow.start || currentTime > rules.timeWindow.end) {
        excludedReasons.push(`Outside time window: ${currentTime} (${rules.timeWindow.start}-${rules.timeWindow.end})`);
        return {
          eligible: false,
          reason: `Time window: current time ${currentTime} outside ${rules.timeWindow.start}-${rules.timeWindow.end}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Time window: ${rules.timeWindow.start}-${rules.timeWindow.end}`);
    }

    // 12. OPTIONAL: Cut-off time check
    if (rules.cutOffTime) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentTime > rules.cutOffTime) {
        excludedReasons.push(`Past cut-off time: ${currentTime} > ${rules.cutOffTime}`);
        return {
          eligible: false,
          reason: `Cut-off time: current time ${currentTime} past ${rules.cutOffTime}`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push(`Before cut-off: ${rules.cutOffTime}`);
    }

    // 13. OPTIONAL: Priority/SLA check
    if (rules.priorityOnly) {
      // Check if order has express/same-day indicators
      const isPriority = order.orderSources?.some(os => 
        os.shippingProvider?.toUpperCase().includes('EXPRESS') ||
        os.shippingProvider?.toUpperCase().includes('SAME_DAY')
      ) || order.shippingProvider?.toUpperCase().includes('EXPRESS');
      
      if (!isPriority) {
        excludedReasons.push(`Not a priority order`);
        return {
          eligible: false,
          reason: `Priority filter: order is not marked as priority/express`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push('Priority order');
    }

    if (rules.slaDriven) {
      // Check if order is from SLA-driven marketplace (Amazon, etc.)
      const isSlaDriven = order.integration?.type === 'AMAZON' || 
                         order.orderSources?.[0]?.integration?.type === 'AMAZON';
      if (!isSlaDriven) {
        excludedReasons.push(`Not SLA-driven marketplace`);
        return {
          eligible: false,
          reason: `SLA filter: order not from SLA-driven marketplace`,
          matchedRules: [],
          excludedReason: excludedReasons.join('; '),
        };
      }
      matchedRules.push('SLA-driven marketplace');
    }

    // 14. OPTIONAL: Warehouse filter
    if (rules.warehouseId && order.warehouseId !== rules.warehouseId) {
      excludedReasons.push(`Warehouse mismatch: ${order.warehouseId} (required: ${rules.warehouseId})`);
      return {
        eligible: false,
        reason: `Warehouse filter: order warehouse ${order.warehouseId} != ${rules.warehouseId}`,
        matchedRules: [],
        excludedReason: excludedReasons.join('; '),
      };
    }
    if (order.warehouseId) {
      matchedRules.push(`Warehouse: ${order.warehouseId}`);
    }

    return {
      eligible: true,
      reason: `Order matches all rules`,
      matchedRules,
    };
  }

  /**
   * Check stock availability for all items in an order
   */
  private async checkStockAvailability(
    order: OrderWithDetails,
    companyId: string
  ): Promise<{ available: boolean; reason: string }> {
    if (!order.items || order.items.length === 0) {
      return {
        available: false,
        reason: 'Order has no items',
      };
    }

    const warehouseId = order.warehouseId;
    if (!warehouseId) {
      return {
        available: false,
        reason: 'Order has no warehouse assigned',
      };
    }

    const stockIssues: string[] = [];

    for (const item of order.items) {
      if (!item.productId) {
        stockIssues.push(`Item ${item.sku}: product not found`);
        continue;
      }

      // Check stock for product (or variant)
      const stock = await prisma.stock.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId || null,
          warehouseId: warehouseId,
        },
      });

      const availableQty = stock ? stock.quantity - stock.reservedQty : 0;
      const requiredQty = item.quantity;

      if (availableQty < requiredQty) {
        stockIssues.push(
          `${item.sku}: required ${requiredQty}, available ${availableQty}`
        );
      }
    }

    if (stockIssues.length > 0) {
      return {
        available: false,
        reason: `Stock unavailable: ${stockIssues.join('; ')}`,
      };
    }

    return {
      available: true,
      reason: 'All items have sufficient stock',
    };
  }

  /**
   * Group orders by same SKU for consolidation
   */
  groupOrdersBySku(orders: OrderWithDetails[]): Map<string, OrderWithDetails[]> {
    const grouped = new Map<string, OrderWithDetails[]>();

    for (const order of orders) {
      if (!order.items || order.items.length === 0) continue;

      // For single-SKU orders, group by that SKU
      if (order.items.length === 1) {
        const sku = order.items[0].sku.toUpperCase();
        if (!grouped.has(sku)) {
          grouped.set(sku, []);
        }
        grouped.get(sku)!.push(order);
      } else {
        // For multi-SKU orders, group by first SKU (or create a mixed group)
        const firstSku = order.items[0].sku.toUpperCase();
        const key = `MIXED-${firstSku}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(order);
      }
    }

    return grouped;
  }

  /**
   * Generate creation reason from matched rules
   */
  generateCreationReason(matchedRules: string[], waveType: WaveType): string {
    const reasons: string[] = [];

    if (waveType === 'TIME_BASED') {
      reasons.push('Time-based wave');
    } else if (waveType === 'SKU_BASED') {
      reasons.push('SKU-based consolidation');
    } else if (waveType === 'PRIORITY') {
      reasons.push('Priority/Express orders');
    } else if (waveType === 'MARKETPLACE') {
      const marketplace = matchedRules.find(r => r.startsWith('Marketplace:'));
      if (marketplace) {
        reasons.push(marketplace);
      } else {
        reasons.push('Marketplace grouping');
      }
    } else if (waveType === 'SHIPPING') {
      const shipping = matchedRules.find(r => r.startsWith('Shipping:'));
      if (shipping) {
        reasons.push(shipping);
      } else {
        reasons.push('Shipping method grouping');
      }
    } else if (waveType === 'COUNTRY') {
      const country = matchedRules.find(r => r.startsWith('Country:'));
      if (country) {
        reasons.push(country);
      } else {
        reasons.push('Country grouping');
      }
    } else if (waveType === 'MIXED') {
      reasons.push('Multiple rules');
    } else {
      reasons.push('Manual selection');
    }

    // Add key matching rules
    const keyRules = matchedRules.filter(r => 
      r.startsWith('Marketplace:') ||
      r.startsWith('Shipping:') ||
      r.startsWith('Carrier:') ||
      r.startsWith('Country:') ||
      r.includes('SKU')
    );

    if (keyRules.length > 0) {
      reasons.push(...keyRules);
    }

    return reasons.join(' + ');
  }
}

export const waveRuleEngine = new WaveRuleEngine();

