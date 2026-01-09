/**
 * Order DTOs (Data Transfer Objects)
 * 
 * These interfaces represent the domain-safe types for Orders
 * that are returned from the API, with all Prisma types converted.
 */

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    gtin: string | null;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name: string;
        zone: string | null;
        aisle: string | null;
        shelf: string | null;
        bin: string | null;
      } | null;
    }>;
  } | null;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string | null;
    locationAssignments?: Array<{
      id: string;
      isPrimary: boolean;
      location: {
        id: string;
        code: string;
        name: string;
        zone: string | null;
        aisle: string | null;
        shelf: string | null;
        bin: string | null;
      } | null;
    }>;
  } | null;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  marketplaceOrderId: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string;
  shippingCity: string | null;
  shippingDistrict: string | null;
  shippingPostalCode: string | null;
  billingAddress: string | null;
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discount: number;
  total: number;
  customerNote: string | null;
  integrationId: string | null;
  warehouseId: string | null;
  pickingWaveId: string | null;
  companyId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemDTO[];
  warehouse: {
    id: string;
    name: string;
    code: string;
  } | null;
  integration: {
    id: string;
    type: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}
