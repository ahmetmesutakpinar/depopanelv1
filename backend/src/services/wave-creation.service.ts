/**
 * Wave Creation Service
 * 
 * Handles automatic and manual wave creation with comprehensive rule evaluation,
 * stock validation, and safety checks.
 */

import { prisma } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { waveRuleEngine, WaveRule, WaveType } from '../utils/wave-rule-engine.js';
import { pickingWaveRepository } from '../repositories/picking-wave.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { AppError } from '../middleware/error.middleware.js';
import { WaveStatus, OrderStatus, Prisma } from '@prisma/client';

export interface CreateWaveOptions {
  companyId: string;
  warehouseId: string;
  type: WaveType;
  rules: WaveRule;
  maxOrdersPerWave?: number;
  minOrdersPerWave?: number;
  priority?: number;
  createdBy?: string; // 'system' or userId
}

export interface WaveCreationResult {
  waveId: string;
  waveCode: string;
  totalOrders: number;
  totalItems: number;
  creationReason: string;
  eligibleOrders: number;
  excludedOrders: number;
  excludedReasons: Map<string, number>; // reason -> count
}

export interface OrderEligibilityResult {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  reason?: string;
  excludedReason?: string;
  matchedRules: string[];
  order?: any; // Full order object for grouping
}

export class WaveCreationService {
  /**
   * Create a wave automatically based on rules
   */
  async createWaveAutomatically(options: CreateWaveOptions): Promise<WaveCreationResult[]> {
    logger.info(`[Wave Creation] Starting automatic wave creation`, {
      companyId: options.companyId,
      warehouseId: options.warehouseId,
      type: options.type,
      rules: options.rules,
    });

    // 1. Find eligible orders
    const eligibilityResults = await this.findEligibleOrders(options);
    
    const eligibleOrders = eligibilityResults.filter(r => r.eligible);
    const excludedOrders = eligibilityResults.filter(r => !r.eligible);

    logger.info(`[Wave Creation] Eligibility check complete`, {
      eligible: eligibleOrders.length,
      excluded: excludedOrders.length,
      totalCandidates: eligibilityResults.length,
    });

    // Log excluded reasons for debugging
    if (excludedOrders.length > 0) {
      const excludedReasonsCount = new Map<string, number>();
      excludedOrders.forEach(o => {
        const reason = o.excludedReason || 'Unknown';
        excludedReasonsCount.set(reason, (excludedReasonsCount.get(reason) || 0) + 1);
      });
      logger.warn(`[Wave Creation] Excluded orders breakdown`, {
        reasons: Object.fromEntries(excludedReasonsCount),
        sampleExcluded: excludedOrders.slice(0, 5).map(o => ({
          orderNumber: o.orderNumber,
          reason: o.excludedReason,
        })),
      });
    }

    if (eligibleOrders.length === 0) {
      logger.error(`[Wave Creation] No eligible orders found`, {
        totalCandidates: eligibilityResults.length,
        excludedCount: excludedOrders.length,
        warehouseId: options.warehouseId,
        companyId: options.companyId,
      });
    }

    // 2. Group orders based on wave type
    let groupedOrders: Map<string, any[]>;
    
    if (options.type === 'SKU_BASED' && options.rules.sameSkuConsolidation) {
      // Group by SKU for consolidation
      const orders = eligibleOrders.map(r => r.order).filter(o => o !== undefined) as any[];
      groupedOrders = waveRuleEngine.groupOrdersBySku(orders);
    } else {
      // Single group for other types
      const orders = eligibleOrders.map(r => r.order).filter(o => o !== undefined);
      groupedOrders = new Map([['default', orders]]);
    }

    // 3. Create waves for each group
    const createdWaves: WaveCreationResult[] = [];
    const excludedReasons = new Map<string, number>();

    for (const [groupKey, orders] of groupedOrders) {
      if (orders.length === 0) continue;

      // Check minimum orders requirement
      const minOrders = options.minOrdersPerWave || 1;
      if (orders.length < minOrders) {
        logger.info(`[Wave Creation] Group ${groupKey} has ${orders.length} orders, minimum ${minOrders} required`);
        continue;
      }

      // Limit to max orders per wave
      const maxOrders = options.maxOrdersPerWave || 100;
      const ordersToInclude = orders.slice(0, maxOrders);

      logger.info(`[Wave Creation] Creating wave for group ${groupKey}`, {
        groupKey,
        totalOrdersInGroup: orders.length,
        ordersToInclude: ordersToInclude.length,
        maxOrdersPerWave: maxOrders,
        firstOrderNumbers: ordersToInclude.slice(0, 5).map((o: any) => o.orderNumber || o.id),
      });

      // Create wave
      const waveResult = await this.createWaveFromOrders({
        companyId: options.companyId,
        warehouseId: options.warehouseId,
        type: options.type,
        orders: ordersToInclude,
        rules: options.rules,
        priority: options.priority || 0,
        createdBy: options.createdBy || 'system',
        groupKey,
      });

      createdWaves.push(waveResult);
    }

    // Count excluded reasons
    for (const excluded of excludedOrders) {
      const reason = excluded.excludedReason || 'Unknown reason';
      excludedReasons.set(reason, (excludedReasons.get(reason) || 0) + 1);
    }

    logger.info(`[Wave Creation] Wave creation complete`, {
      wavesCreated: createdWaves.length,
      totalOrdersInWaves: createdWaves.reduce((sum, w) => sum + w.totalOrders, 0),
      excludedOrders: excludedOrders.length,
      excludedReasons: Object.fromEntries(excludedReasons),
    });

    return createdWaves;
  }

  /**
   * Find orders eligible for wave creation
   */
  async findEligibleOrders(
    options: CreateWaveOptions
  ): Promise<OrderEligibilityResult[]> {
    const results: OrderEligibilityResult[] = [];

    // Build query for eligible orders
    // Eski sistem uyumluluğu: READY_TO_PICK yoksa PENDING ve PROCESSING'i de kabul et
    const requestedStatus = options.rules.orderStatus || 'READY_TO_PICK';
    
    // Status mapping: READY_TO_PICK için PENDING ve PROCESSING'i de dahil et
    let statusFilter: OrderStatus | { in: OrderStatus[] };
    if (requestedStatus === 'READY_TO_PICK') {
      // READY_TO_PICK için PENDING, PROCESSING ve READY_TO_PICK'i kabul et
      statusFilter = { in: ['PENDING', 'PROCESSING', 'READY_TO_PICK'] };
    } else {
      // Diğer durumlarda sadece belirtilen status'ü kabul et
      statusFilter = requestedStatus;
    }
    
    // Get orders with required status
    const orders = await prisma.order.findMany({
      where: {
        companyId: options.companyId,
        warehouseId: options.warehouseId || undefined,
        status: statusFilter,
        pickingWaveId: null, // Not already in a wave
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
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
        orderSources: {
          include: {
            integration: true,
          },
        },
        integration: true,
      },
      take: 1000, // Limit for performance
      orderBy: {
        createdAt: 'asc',
      },
    });

    logger.info(`[Wave Creation] Found ${orders.length} candidate orders`, {
      companyId: options.companyId,
      warehouseId: options.warehouseId,
      statusFilter: statusFilter,
    });

    if (orders.length === 0) {
      logger.warn(`[Wave Creation] No orders found with criteria`, {
        companyId: options.companyId,
        warehouseId: options.warehouseId,
        statusFilter: statusFilter,
      });
    }

    // Evaluate each order
    for (const order of orders) {
      const evaluation = await waveRuleEngine.evaluateOrder(
        order as any,
        options.rules,
        options.companyId
      );

      results.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        eligible: evaluation.eligible,
        reason: evaluation.reason,
        excludedReason: evaluation.excludedReason,
        matchedRules: evaluation.matchedRules,
        order: order as any,
      });

      // Log eligibility decision
      if (evaluation.eligible) {
        logger.debug(`[Wave Creation] Order ${order.orderNumber} is ELIGIBLE`, {
          matchedRules: evaluation.matchedRules,
        });
      } else {
        logger.warn(`[Wave Creation] Order ${order.orderNumber} is EXCLUDED`, {
          reason: evaluation.excludedReason || evaluation.reason || 'Unknown reason',
          excludedReason: evaluation.excludedReason,
          mainReason: evaluation.reason,
          orderStatus: order.status,
          orderItemsCount: order.items?.length || 0,
        });
      }
    }

    return results;
  }

  /**
   * Create a wave from a list of orders
   */
  async createWaveFromOrders(data: {
    companyId: string;
    warehouseId: string;
    type: WaveType;
    orders: any[];
    rules: WaveRule;
    priority: number;
    createdBy: string;
    groupKey: string;
  }): Promise<WaveCreationResult> {
    if (data.orders.length === 0) {
      throw new AppError('Cannot create wave with no orders', 400);
    }

    // Generate wave code
    const waveCode = await pickingWaveRepository.generateWaveCode(data.companyId);

    // Calculate totals
    const totalOrders = data.orders.length;
    const totalItems = data.orders.reduce((sum, order) => {
      return sum + (order.items?.length || 0);
    }, 0);

    // Generate creation reason
    const firstOrder = data.orders[0];
    const firstEvaluation = await waveRuleEngine.evaluateOrder(
      firstOrder,
      data.rules,
      data.companyId
    );
    const creationReason = waveRuleEngine.generateCreationReason(
      firstEvaluation.matchedRules,
      data.type
    );

    // Create wave
    const wave = await prisma.$transaction(async (tx) => {
      // Create wave record
      // Status mapping: CREATED → PENDING (eski sistem uyumluluğu için)
      const wave = await tx.pickingWave.create({
        data: {
          code: waveCode,
          warehouseId: data.warehouseId,
          strategy: 'WAVE',
          type: data.type,
          status: 'PENDING', // CREATED yerine PENDING (eski sistem)
          priority: data.priority,
          companyId: data.companyId,
          createdBy: data.createdBy,
          creationReason: creationReason,
          totalOrders: totalOrders,
          totalItems: totalItems,
          rules: data.rules as Prisma.InputJsonValue,
          cutOffTime: data.rules.cutOffTime 
            ? this.parseCutOffTime(data.rules.cutOffTime)
            : null,
        },
      });

      // Assign orders to wave
      await tx.order.updateMany({
        where: {
          id: { in: data.orders.map(o => o.id) },
        },
        data: {
          pickingWaveId: wave.id,
        },
      });

      // Log each order assignment
      for (const order of data.orders) {
        logger.info(`[Wave Creation] Order #${order.orderNumber} added to Wave #${waveCode}`, {
          reason: creationReason,
          orderId: order.id,
          waveId: wave.id,
        });
      }

      return wave;
    });

    logger.info(`[Wave Creation] Wave ${waveCode} created successfully`, {
      waveId: wave.id,
      totalOrders,
      totalItems,
      creationReason,
    });

    return {
      waveId: wave.id,
      waveCode: wave.code,
      totalOrders,
      totalItems,
      creationReason,
      eligibleOrders: totalOrders,
      excludedOrders: 0,
      excludedReasons: new Map(),
    };
  }

  /**
   * Create a time-based wave (Morning/Afternoon)
   */
  async createTimeBasedWave(
    companyId: string,
    warehouseId: string,
    cutOffTime: string, // HH:mm
    options?: {
      priority?: number;
      maxOrders?: number;
      minOrders?: number;
    }
  ): Promise<WaveCreationResult> {
    const rules: WaveRule = {
      orderStatus: 'READY_TO_PICK',
      requireStockAvailable: true,
      cutOffTime: cutOffTime,
    };

    const waves = await this.createWaveAutomatically({
      companyId,
      warehouseId,
      type: 'TIME_BASED',
      rules,
      maxOrdersPerWave: options?.maxOrders,
      minOrdersPerWave: options?.minOrders || 1,
      priority: options?.priority || 0,
      createdBy: 'system',
    });
    
    return waves[0] || {
      waveId: '',
      waveCode: '',
      totalOrders: 0,
      totalItems: 0,
      creationReason: 'No waves created',
      eligibleOrders: 0,
      excludedOrders: 0,
      excludedReasons: new Map(),
    };
  }

  /**
   * Create a SKU-based wave (same SKU consolidation)
   */
  async createSkuBasedWave(
    companyId: string,
    warehouseId: string,
    options?: {
      priority?: number;
      maxOrders?: number;
      minOrders?: number;
      skuList?: string[];
    }
  ): Promise<WaveCreationResult> {
    const rules: WaveRule = {
      orderStatus: 'READY_TO_PICK',
      requireStockAvailable: true,
      sameSkuConsolidation: true,
      skuList: options?.skuList,
    };

    const waves = await this.createWaveAutomatically({
      companyId,
      warehouseId,
      type: 'SKU_BASED',
      rules,
      maxOrdersPerWave: options?.maxOrders,
      minOrdersPerWave: options?.minOrders || 1,
      priority: options?.priority || 0,
      createdBy: 'system',
    });
    
    return waves[0] || {
      waveId: '',
      waveCode: '',
      totalOrders: 0,
      totalItems: 0,
      creationReason: 'No waves created',
      eligibleOrders: 0,
      excludedOrders: 0,
      excludedReasons: new Map(),
    };
  }

  /**
   * Create a priority wave (Express/Same-day)
   */
  async createPriorityWave(
    companyId: string,
    warehouseId: string,
    options?: {
      priority?: number;
      maxOrders?: number;
      minOrders?: number;
    }
  ): Promise<WaveCreationResult> {
    const rules: WaveRule = {
      orderStatus: 'READY_TO_PICK',
      requireStockAvailable: true,
      priorityOnly: true,
    };

    const waves = await this.createWaveAutomatically({
      companyId,
      warehouseId,
      type: 'PRIORITY',
      rules,
      maxOrdersPerWave: options?.maxOrders,
      minOrdersPerWave: options?.minOrders || 1,
      priority: options?.priority || 10, // Higher priority for express orders
      createdBy: 'system',
    });
    
    return waves[0] || {
      waveId: '',
      waveCode: '',
      totalOrders: 0,
      totalItems: 0,
      creationReason: 'No waves created',
      eligibleOrders: 0,
      excludedOrders: 0,
      excludedReasons: new Map(),
    };
  }

  /**
   * Create a manual wave (admin-selected orders)
   */
  async createManualWave(
    companyId: string,
    warehouseId: string,
    orderIds: string[],
    options?: {
      priority?: number;
      createdBy?: string;
    }
  ): Promise<WaveCreationResult> {
    // Get orders
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        companyId,
        warehouseId,
      },
      include: {
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
        orderSources: {
          include: {
            integration: true,
          },
        },
        integration: true,
      },
    });

    if (orders.length === 0) {
      throw new AppError('No valid orders found for manual wave', 400);
    }

    // Check if any orders are already in a wave
    const ordersInWave = orders.filter(o => o.pickingWaveId);
    if (ordersInWave.length > 0) {
      throw new AppError(
        `Some orders are already in a wave: ${ordersInWave.map(o => o.orderNumber).join(', ')}`,
        400
      );
    }

    // Create wave
    const rules: WaveRule = {
      orderStatus: 'READY_TO_PICK',
      requireStockAvailable: true,
    };

    return this.createWaveFromOrders({
      companyId,
      warehouseId,
      type: 'MANUAL',
      orders,
      rules,
      priority: options?.priority || 0,
      createdBy: options?.createdBy || 'admin',
      groupKey: 'manual',
    });
  }

  /**
   * Parse cut-off time string (HH:mm) to DateTime
   */
  private parseCutOffTime(cutOffTime: string): Date {
    const [hours, minutes] = cutOffTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  /**
   * Handle order cancellation - remove from wave
   */
  async handleOrderCancellation(orderId: string, companyId: string): Promise<void> {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        companyId,
      },
    });

    if (!order || !order.pickingWaveId) {
      return; // Order not in a wave
    }

    const wave = await prisma.pickingWave.findUnique({
      where: { id: order.pickingWaveId },
    });

    if (!wave) {
      return;
    }

    // Remove order from wave
    await prisma.order.update({
      where: { id: orderId },
      data: { pickingWaveId: null },
    });

    // Update wave totals
    const remainingOrders = await prisma.order.count({
      where: { pickingWaveId: wave.id },
    });

    await prisma.pickingWave.update({
      where: { id: wave.id },
      data: {
        totalOrders: remainingOrders,
      },
    });

    logger.info(`[Wave Creation] Order ${order.orderNumber} removed from wave ${wave.code} due to cancellation`, {
      orderId,
      waveId: wave.id,
    });

    // If wave has no orders left, close it
    if (remainingOrders === 0 && wave.status !== WaveStatus.CLOSED) {
      await prisma.pickingWave.update({
        where: { id: wave.id },
        data: {
          status: WaveStatus.CANCELLED,
          closedAt: new Date(),
        },
      });

      logger.info(`[Wave Creation] Wave ${wave.code} cancelled (no orders remaining)`);
    }
  }

  /**
   * Check and flag stock exceptions in a wave
   */
  async checkStockExceptions(waveId: string, companyId: string): Promise<void> {
    const wave = await prisma.pickingWave.findFirst({
      where: {
        id: waveId,
        companyId,
      },
      include: {
        orders: {
          include: {
            items: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
      },
    });

    if (!wave) {
      throw new AppError('Wave not found', 404);
    }

    const stockIssues: string[] = [];

    for (const order of wave.orders) {
      for (const item of order.items) {
        if (!item.productId) continue;

        const stock = await prisma.stock.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId || null,
            warehouseId: wave.warehouseId,
          },
        });

        const availableQty = stock ? stock.quantity - stock.reservedQty : 0;
        const requiredQty = item.quantity;

        if (availableQty < requiredQty) {
          stockIssues.push(
            `Order ${order.orderNumber}, ${item.sku}: required ${requiredQty}, available ${availableQty}`
          );
        }
      }
    }

    if (stockIssues.length > 0) {
      await prisma.pickingWave.update({
        where: { id: waveId },
        data: {
          hasStockIssue: true,
          stockIssueNote: stockIssues.join('; '),
        },
      });

      logger.warn(`[Wave Creation] Wave ${wave.code} flagged with stock issues`, {
        waveId,
        issues: stockIssues,
      });
    } else {
      await prisma.pickingWave.update({
        where: { id: waveId },
        data: {
          hasStockIssue: false,
          stockIssueNote: null,
        },
      });
    }
  }
}

export const waveCreationService = new WaveCreationService();

