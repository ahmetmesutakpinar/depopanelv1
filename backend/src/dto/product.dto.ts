/**
 * Product DTOs
 * Domain-safe types for Product entities
 */

export interface ProductDTO {
  id: string;
  sku: string;
  barcode: string | null;
  gtin: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  price: number;
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
  wooCommerceId: number | null;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  campaignSetId: string | null;
  minQuantity: number;
}
