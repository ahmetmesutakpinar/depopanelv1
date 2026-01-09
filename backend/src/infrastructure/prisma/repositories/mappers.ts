/**
 * Prisma to Domain Entity Mappers
 * 
 * Maps Prisma database models to domain entities.
 * These mappers handle:
 * - Decimal → number conversion
 * - Null → undefined conversion where needed
 * - Type transformations
 * 
 * Architecture:
 * - Infrastructure layer only
 * - No business logic
 * - Pure data transformation
 */

import { Product as PrismaProduct, Order as PrismaOrder, OrderItem as PrismaOrderItem, Stock as PrismaStock, Company as PrismaCompany, MarketplaceIntegration as PrismaMarketplaceIntegration } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Product } from '../../../domain/entities/product.entity.js';
import { Order, OrderStatus } from '../../../domain/entities/order.entity.js';
import { OrderItem } from '../../../domain/entities/order-item.entity.js';
import { Stock } from '../../../domain/entities/stock.entity.js';
import { Company, CompanyStatus } from '../../../domain/entities/company.entity.js';
import { MarketplaceConnection, MarketplaceType, IntegrationStatus } from '../../../domain/entities/marketplace-connection.entity.js';
import { toNumber } from '../../../utils/decimal.js';

/**
 * Map Prisma Product to Domain Product
 * TODO: Complete mapping for all fields
 */
export function mapProduct(prismaProduct: PrismaProduct): Product {
  return new Product({
    id: prismaProduct.id,
    sku: prismaProduct.sku,
    barcode: prismaProduct.barcode,
    gtin: prismaProduct.gtin,
    name: prismaProduct.name,
    description: prismaProduct.description,
    brand: prismaProduct.brand,
    price: toNumber(prismaProduct.price),
    costPrice: prismaProduct.costPrice ? toNumber(prismaProduct.costPrice) : null,
    taxRate: toNumber(prismaProduct.taxRate),
    weight: prismaProduct.weight ? toNumber(prismaProduct.weight) : null,
    width: prismaProduct.width ? toNumber(prismaProduct.width) : null,
    height: prismaProduct.height ? toNumber(prismaProduct.height) : null,
    depth: prismaProduct.depth ? toNumber(prismaProduct.depth) : null,
    imageUrl: prismaProduct.imageUrl,
    isActive: prismaProduct.isActive,
    categoryId: prismaProduct.categoryId,
    companyId: prismaProduct.companyId,
    type: prismaProduct.type,
    campaignSetId: prismaProduct.campaignSetId,
    minQuantity: prismaProduct.minQuantity,
    createdAt: prismaProduct.createdAt,
    updatedAt: prismaProduct.updatedAt,
  });
}

/**
 * Map Prisma OrderItem to Domain OrderItem
 * TODO: Complete mapping for all fields
 */
export function mapOrderItem(prismaItem: PrismaOrderItem): OrderItem {
  return new OrderItem({
    id: prismaItem.id,
    orderId: prismaItem.orderId,
    productId: prismaItem.productId,
    variantId: prismaItem.variantId,
    sku: prismaItem.sku,
    name: prismaItem.name,
    quantity: prismaItem.quantity,
    unitPrice: toNumber(prismaItem.unitPrice),
    taxRate: toNumber(prismaItem.taxRate),
    discount: toNumber(prismaItem.discount),
    total: toNumber(prismaItem.total),
  });
}

/**
 * Map Prisma Order to Domain Order
 * TODO: Complete mapping for all fields and relations
 */
export function mapOrder(prismaOrder: PrismaOrder & {
  items?: PrismaOrderItem[];
}): Order {
  return new Order({
    id: prismaOrder.id,
    orderNumber: prismaOrder.orderNumber,
    marketplaceOrderId: prismaOrder.marketplaceOrderId,
    status: prismaOrder.status as OrderStatus,
    customerName: prismaOrder.customerName,
    customerEmail: prismaOrder.customerEmail,
    customerPhone: prismaOrder.customerPhone,
    shippingAddress: prismaOrder.shippingAddress,
    shippingCity: prismaOrder.shippingCity,
    shippingDistrict: prismaOrder.shippingDistrict,
    shippingPostalCode: prismaOrder.shippingPostalCode,
    billingAddress: prismaOrder.billingAddress,
    subtotal: toNumber(prismaOrder.subtotal),
    taxAmount: toNumber(prismaOrder.taxAmount),
    shippingCost: toNumber(prismaOrder.shippingCost),
    discount: toNumber(prismaOrder.discount),
    total: toNumber(prismaOrder.total),
    customerNote: prismaOrder.customerNote,
    integrationId: prismaOrder.integrationId,
    warehouseId: prismaOrder.warehouseId,
    pickingWaveId: prismaOrder.pickingWaveId,
    companyId: prismaOrder.companyId,
    createdById: prismaOrder.createdById,
    createdAt: prismaOrder.createdAt,
    updatedAt: prismaOrder.updatedAt,
    items: prismaOrder.items?.map(mapOrderItem) ?? [],
  });
}

/**
 * Map Prisma Stock to Domain Stock
 * TODO: Complete mapping for all fields
 */
export function mapStock(prismaStock: PrismaStock): Stock {
  return new Stock({
    id: prismaStock.id,
    productId: prismaStock.productId,
    variantId: prismaStock.variantId,
    warehouseId: prismaStock.warehouseId,
    locationId: prismaStock.locationId,
    quantity: prismaStock.quantity,
    reservedQty: prismaStock.reservedQty,
    minQuantity: prismaStock.minQuantity,
    companyId: prismaStock.companyId,
    createdAt: prismaStock.createdAt,
    updatedAt: prismaStock.updatedAt,
  });
}

/**
 * Map Prisma Company to Domain Company
 * TODO: Domain Company entity has slug field but Prisma has email - need to align
 */
export function mapCompany(prismaCompany: PrismaCompany): Company {
  // TODO: Domain Company entity expects slug but Prisma has email
  // For now, using email as slug placeholder - domain entity should be updated or Prisma should have slug
  return new Company({
    id: prismaCompany.id,
    name: prismaCompany.name,
    slug: prismaCompany.email, // TODO: Domain entity expects slug, Prisma has email - need to align
    status: prismaCompany.status as CompanyStatus,
    settings: null, // TODO: Prisma Company doesn't have settings field in schema
    createdAt: prismaCompany.createdAt,
    updatedAt: prismaCompany.updatedAt,
  });
}

/**
 * Map Prisma MarketplaceIntegration to Domain MarketplaceConnection
 * TODO: Complete mapping for all fields
 */
export function mapMarketplaceConnection(prismaIntegration: PrismaMarketplaceIntegration): MarketplaceConnection {
  return new MarketplaceConnection({
    id: prismaIntegration.id,
    companyId: prismaIntegration.companyId,
    type: prismaIntegration.type as MarketplaceType,
    name: prismaIntegration.name,
    status: prismaIntegration.status as IntegrationStatus,
    settings: prismaIntegration.settings as Record<string, unknown> | null,
    lastSyncAt: prismaIntegration.lastSyncAt,
    syncMode: (prismaIntegration.settings as any)?.syncMode ?? 'AUTO', // TODO: Extract from settings properly
    isReadOnly: (prismaIntegration.settings as any)?.isReadOnly ?? false, // TODO: Extract from settings properly
    createdAt: prismaIntegration.createdAt,
    updatedAt: prismaIntegration.updatedAt,
  });
}

