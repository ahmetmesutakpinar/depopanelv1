/**
 * Central Barcode Matching Utility
 * 
 * This utility provides comprehensive barcode matching functionality
   * that checks all possible barcode fields (barcode, GTIN, EAN)
 * for both products and variants.
 * 
 * Priority order for order items:
 * 1. Item barcode (entegrasyondan gelen)
 * 2. Product GTIN/EAN (WooCommerce _global_unique_id) - varsa
 * 3. SKU (EAN yoksa 2. seçenek olarak kullanılır)
 * 4. Variant barcode
 * 5. Product barcode
 */

export interface BarcodeMatchable {
  barcode?: string | null;
  gtin?: string | null;
  ean?: string | null;
  sku?: string | null;
}

export interface ProductBarcodeMatchable extends BarcodeMatchable {
  variants?: Array<{
    barcode?: string | null;
    sku?: string | null;
  }>;
}

export interface OrderItemBarcodeMatchable {
  product?: BarcodeMatchable | null;
  variant?: BarcodeMatchable | null;
  sku?: string | null;
  barcode?: string | null; // Entegrasyondan gelen barcode (OrderItem.barcode)
}

/**
 * Normalize barcode for comparison
 * - Trim whitespace
 * - Convert to uppercase
 * - Remove special characters (optional, can be enabled)
 */
export function normalizeBarcode(barcode: string | null | undefined): string | null {
  if (!barcode) return null;
  return barcode.trim().toUpperCase();
}

/**
 * Get all possible barcodes from a product (including variants)
 * Returns array of normalized barcodes in priority order
 */
export function getAllProductBarcodes(product: ProductBarcodeMatchable): string[] {
  const barcodes: string[] = [];

  // Priority 1: GTIN/EAN (most reliable - WooCommerce _global_unique_id)
  const gtin = normalizeBarcode(product.gtin || product.ean);
  if (gtin) barcodes.push(gtin);

  // Priority 2: Product barcode
  const productBarcode = normalizeBarcode(product.barcode);
  if (productBarcode && !barcodes.includes(productBarcode)) {
    barcodes.push(productBarcode);
  }

  // Priority 3: Variant barcodes (SKU'lar hariç - sadece gerçek barkod alanları)
  if (product.variants) {
    for (const variant of product.variants) {
      const variantBarcode = normalizeBarcode(variant.barcode);
      if (variantBarcode && !barcodes.includes(variantBarcode)) {
        barcodes.push(variantBarcode);
      }
      // SKU'lar barkod olarak kabul edilmez
    }
  }

  return barcodes;
}

/**
 * Get all possible barcodes from an order item
 * Returns array of normalized barcodes in priority order
 */
export function getAllOrderItemBarcodes(item: OrderItemBarcodeMatchable): string[] {
  const barcodes: string[] = [];

  // Priority 1: Item barcode (entegrasyondan gelen barcode - en öncelikli)
  const itemBarcode = normalizeBarcode(item.barcode);
  if (itemBarcode) barcodes.push(itemBarcode);

  // Priority 2: Product GTIN/EAN (WooCommerce _global_unique_id)
  const productGtin = normalizeBarcode(item.product?.gtin || item.product?.ean);
  if (productGtin && !barcodes.includes(productGtin)) {
    barcodes.push(productGtin);
  }

  // Priority 2.5: SKU (EAN yoksa 2. seçenek olarak kullanılır)
  // EAN/GTIN yoksa SKU'yu da kontrol et
  if (!productGtin) {
    const itemSku = normalizeBarcode(item.sku);
    if (itemSku && !barcodes.includes(itemSku)) {
      barcodes.push(itemSku);
    }
  }

  // Priority 3: Variant barcode
  const variantBarcode = normalizeBarcode(item.variant?.barcode);
  if (variantBarcode && !barcodes.includes(variantBarcode)) {
    barcodes.push(variantBarcode);
  }

  // Priority 4: Product barcode
  const productBarcode = normalizeBarcode(item.product?.barcode);
  if (productBarcode && !barcodes.includes(productBarcode)) {
    barcodes.push(productBarcode);
  }

  return barcodes;
}

/**
 * Check if a barcode matches a product
 */
export function matchesProduct(
  barcode: string,
  product: ProductBarcodeMatchable
): boolean {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode) return false;

  const productBarcodes = getAllProductBarcodes(product);
  return productBarcodes.includes(normalizedBarcode);
}

/**
 * Check if a barcode matches an order item
 */
export function matchesOrderItem(
  barcode: string,
  item: OrderItemBarcodeMatchable
): boolean {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode) return false;

  const itemBarcodes = getAllOrderItemBarcodes(item);
  return itemBarcodes.includes(normalizedBarcode);
}

/**
 * Find order item by barcode from an array of items
 */
export function findOrderItemByBarcode<T extends OrderItemBarcodeMatchable>(
  barcode: string,
  items: T[]
): T | undefined {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode) return undefined;

  return items.find(item => matchesOrderItem(barcode, item));
}

/**
 * Get the primary barcode for a product (highest priority)
 */
export function getPrimaryBarcode(product: ProductBarcodeMatchable): string | null {
  const barcodes = getAllProductBarcodes(product);
  return barcodes.length > 0 ? barcodes[0] : null;
}

/**
 * Get the primary barcode for an order item (highest priority)
 */
export function getPrimaryOrderItemBarcode(item: OrderItemBarcodeMatchable): string | null {
  const barcodes = getAllOrderItemBarcodes(item);
  return barcodes.length > 0 ? barcodes[0] : null;
}

