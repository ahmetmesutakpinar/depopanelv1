import { prisma } from '../config/index.js';
import { ProductType } from '@prisma/client';

/**
 * SET ürünün stokunu hesapla
 * 
 * Algoritma:
 * 1. Her bileşen için: "Bu bileşenden kaç set yapılabilir?" hesaplanır
 *    - Örnek: Peynir stoku 100 adet, set başına 2 adet gerekiyor
 *    - → 100 / 2 = 50 set yapılabilir
 * 
 * 2. Tüm bileşenler için minimum değer alınır
 *    - Peynir: 50 set
 *    - Zeytin: 30 set
 *    - Ekmek: 20 set
 *    - → Minimum: 20 set (en az stoklu bileşen belirler)
 * 
 * 3. Set ürünün kendi stoku varsa, onunla da karşılaştırılır
 *    - Set stoku: 15 adet
 *    - Bileşenlerden hesaplanan: 20 adet
 *    - → Sonuç: 15 adet (minimum değer)
 * 
 * @param setProductId SET ürünün ID'si
 * @param warehouseId Depo ID'si (opsiyonel, belirtilmezse tüm depolar)
 * @returns Hesaplanan SET stok miktarı
 */
export async function calculateSetStock(
  setProductId: string,
  warehouseId?: string
): Promise<{
  totalStock: number;
  fromComponents: number;
  fromSetStock: number;
  componentDetails: Array<{
    componentSku: string;
    componentStock: number;
    quantityPerSet: number;
    setsPossible: number;
  }>;
}> {
  const setProduct = await prisma.product.findUnique({
    where: { id: setProductId },
    include: {
      setItems: {
        include: {
          componentProduct: {
            select: {
              id: true,
              sku: true,
              name: true,
            },
          },
        },
      },
      setStocks: {
        where: warehouseId ? { warehouseId } : undefined,
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!setProduct || setProduct.type !== ProductType.SET) {
    throw new Error('SET ürün bulunamadı');
  }

  if (setProduct.setItems.length === 0) {
    // Bileşen yoksa, sadece hazır paket stokunu döndür
    const setStock = setProduct.setStocks.reduce(
      (sum, s) => sum + s.quantity - s.reservedQty,
      0
    );

    return {
      totalStock: setStock,
      fromComponents: 0,
      fromSetStock: setStock,
      componentDetails: [],
    };
  }

  // 1. Her bileşen için kaç set yapılabilir?
  const componentDetails = await Promise.all(
    setProduct.setItems.map(async (item) => {
      const stocks = await prisma.stock.findMany({
        where: {
          productId: item.componentProductId,
          ...(warehouseId && { warehouseId }),
        },
      });

      const totalStock = stocks.reduce(
        (sum, s) => sum + s.quantity - s.reservedQty,
        0
      );

      // Set başına kaç adet gerekiyor?
      const setsPossible = item.quantity > 0 
        ? Math.floor(totalStock / item.quantity)
        : 0;

      return {
        componentSku: item.componentSku,
        componentStock: totalStock,
        quantityPerSet: item.quantity,
        setsPossible,
      };
    })
  );

  // 2. Minimum değer (en az stoklu bileşen belirler)
  const setsFromComponents = componentDetails.map((d) => d.setsPossible);
  const minFromComponents = setsFromComponents.length > 0
    ? Math.min(...setsFromComponents)
    : 0;

  // 3. Set ürünün kendi stoku (hazır paketlenmiş)
  const setStock = setProduct.setStocks.reduce(
    (sum, s) => sum + s.quantity - s.reservedQty,
    0
  );

  // 4. Sonuç: Minimum değer
  const totalStock = Math.min(minFromComponents, setStock);

  return {
    totalStock,
    fromComponents: minFromComponents,
    fromSetStock: setStock,
    componentDetails,
  };
}

/**
 * SET ürünün stokunu basit şekilde hesapla (sadece sayı döndürür)
 */
export async function getSetStockQuantity(
  setProductId: string,
  warehouseId?: string
): Promise<number> {
  const result = await calculateSetStock(setProductId, warehouseId);
  return result.totalStock;
}

