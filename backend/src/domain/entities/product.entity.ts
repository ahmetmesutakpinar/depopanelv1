/**
 * Product Domain Entity
 * 
 * Represents a product in the domain.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - Product must have a SKU (unique identifier)
 * - Product must have a name
 * - Product must have a price (non-negative)
 * - Product can have optional barcode/GTIN
 * 
 * TODO: Add validation logic
 * TODO: Add business methods (isActive, canBeSold, etc.)
 * TODO: Add invariants enforcement
 */

export class Product {
  id: string;
  sku: string;
  barcode: string | null;
  gtin: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  price: number; // In domain, we use number (not Decimal)
  costPrice: number | null;
  taxRate: number;
  weight: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  imageUrl: string | null;
  isActive: boolean;
  categoryId: string | null;
  companyId: string;
  type: 'PRODUCT' | 'SET' | 'VARIANT';
  campaignSetId: string | null;
  minQuantity: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: {
    id: string;
    sku: string;
    barcode?: string | null;
    gtin?: string | null;
    name: string;
    description?: string | null;
    brand?: string | null;
    price: number;
    costPrice?: number | null;
    taxRate?: number;
    weight?: number | null;
    width?: number | null;
    height?: number | null;
    depth?: number | null;
    imageUrl?: string | null;
    isActive?: boolean;
    categoryId?: string | null;
    companyId: string;
    type?: 'PRODUCT' | 'SET' | 'VARIANT';
    campaignSetId?: string | null;
    minQuantity?: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.sku = data.sku;
    this.barcode = data.barcode ?? null;
    this.gtin = data.gtin ?? null;
    this.name = data.name;
    this.description = data.description ?? null;
    this.brand = data.brand ?? null;
    this.price = data.price;
    this.costPrice = data.costPrice ?? null;
    this.taxRate = data.taxRate ?? 20;
    this.weight = data.weight ?? null;
    this.width = data.width ?? null;
    this.height = data.height ?? null;
    this.depth = data.depth ?? null;
    this.imageUrl = data.imageUrl ?? null;
    this.isActive = data.isActive ?? true;
    this.categoryId = data.categoryId ?? null;
    this.companyId = data.companyId;
    this.type = data.type ?? 'PRODUCT';
    this.campaignSetId = data.campaignSetId ?? null;
    this.minQuantity = data.minQuantity ?? 0;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Check if product can be sold
   * TODO: Implement business logic
   */
  canBeSold(): boolean {
    return this.isActive && this.price > 0;
  }

  /**
   * Check if product is a set/bundle
   * TODO: Implement business logic
   */
  isSet(): boolean {
    return this.type === 'SET';
  }
}

