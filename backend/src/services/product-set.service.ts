import { productRepository, CreateProductData, UpdateProductData } from '../repositories/product.repository.js';
import { productSetRepository, CreateProductSetItemData } from '../repositories/product-set.repository.js';
import { setStockRepository } from '../repositories/set-stock.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { ConflictError, NotFoundError, AppError } from '../middleware/error.middleware.js';
import { prisma } from '../config/index.js';
import { ProductType, StockLogType } from '@prisma/client';
import { calculateSetStock } from '../utils/stock-calculator.js';

export interface CreateSetData extends Omit<CreateProductData, 'companyId'> {
  components: {
    componentSku: string;
    quantity: number;
  }[];
}

export interface UpdateSetData extends UpdateProductData {
  components?: {
    componentSku: string;
    quantity: number;
  }[];
}

export interface SetPickingResult {
  success: boolean;
  method: 'SET_READY' | 'COMPONENTS' | 'INSUFFICIENT';
  setStockUsed?: number;
  componentsUsed?: Array<{ sku: string; quantity: number; productId: string }>;
  missingComponents?: Array<{ sku: string; required: number; available: number }>;
}

export interface PackingData {
  setProductId: string;
  warehouseId: string;
  locationId?: string;
  quantity: number;
  userId?: string;
}

export interface ReturnSetData {
  setProductId: string;
  warehouseId: string;
  locationId?: string;
  quantity: number;
  isIntact: boolean; // true = kapalı kutu, false = bozuk/eksik
  userId?: string;
  note?: string;
}

class ProductSetService {
  /**
   * SET ürünlerini listele
   */
  async getSets(companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { products, total } = await productRepository.findByCompany(companyId, {
      skip,
      take,
      search: options?.search,
    });

    // Filter SET products
    const sets = products.filter((p: any) => p.type === ProductType.SET);

    return {
      sets,
      pagination: {
        page: options?.page || 1,
        limit: take,
        total: sets.length,
        totalPages: Math.ceil(sets.length / take),
      },
    };
  }

  /**
   * SET ürünü oluştur
   */
  async createSet(companyId: string, data: CreateSetData) {
    // Check if SKU exists
    const skuExists = await productRepository.existsBySku(companyId, data.sku);
    if (skuExists) {
      throw new ConflictError('Bu SKU zaten kullanımda');
    }

    // Validate components exist
    const componentProducts = await Promise.all(
      data.components.map(async (comp) => {
        const product = await productRepository.findBySku(companyId, comp.componentSku);
        if (!product) {
          throw new NotFoundError(`Component ürün bulunamadı: ${comp.componentSku}`);
        }
        if (product.type === ProductType.SET) {
          throw new AppError('SET içinde SET olamaz', 400);
        }
        return { ...comp, productId: product.id };
      })
    );

    // Create SET product with components
    return prisma.$transaction(async (tx) => {
      // Create SET product
      const setProduct = await tx.product.create({
        data: {
          ...data,
          type: ProductType.SET,
          companyId,
        },
      });

      // Create SET items
      const setItems: CreateProductSetItemData[] = componentProducts.map((comp) => ({
        setProductId: setProduct.id,
        componentSku: comp.componentSku,
        componentProductId: comp.productId,
        quantity: comp.quantity,
      }));

      await tx.productSetItem.createMany({
        data: setItems,
      });

      return setProduct;
    });
  }

  /**
   * SET ürününü güncelle
   */
  async updateSet(setProductId: string, companyId: string, data: UpdateSetData) {
    const setProduct = await productRepository.findByIdAndCompany(setProductId, companyId);

    if (!setProduct) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    if (setProduct.type !== ProductType.SET) {
      throw new AppError('Bu ürün bir SET değil', 400);
    }

    const { components, ...productData } = data;

    return prisma.$transaction(async (tx) => {
      // Update product data
      if (Object.keys(productData).length > 0) {
        await tx.product.update({
          where: { id: setProductId },
          data: productData,
        });
      }

      // Update components if provided
      if (components) {
        // Validate components exist
        const componentProducts = await Promise.all(
          components.map(async (comp) => {
            const product = await productRepository.findBySku(companyId, comp.componentSku);
            if (!product) {
              throw new NotFoundError(`Component ürün bulunamadı: ${comp.componentSku}`);
            }
            if (product.type === ProductType.SET) {
              throw new AppError('SET içinde SET olamaz', 400);
            }
            return { ...comp, productId: product.id };
          })
        );

        // Delete existing items
        await tx.productSetItem.deleteMany({
          where: { setProductId },
        });

        // Create new items
        if (componentProducts.length > 0) {
          const setItems: CreateProductSetItemData[] = componentProducts.map((comp) => ({
            setProductId,
            componentSku: comp.componentSku,
            componentProductId: comp.productId,
            quantity: comp.quantity,
          }));

          await tx.productSetItem.createMany({
            data: setItems,
          });
        }
      }

      return tx.product.findUnique({
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
        },
      });
    });
  }

  /**
   * SET ürününü getir (components ile birlikte)
   * Stok hesaplama: Bileşenlerin stoklarına göre dinamik hesaplama yapılır
   */
  async getSetById(setProductId: string, companyId: string, warehouseId?: string) {
    const product = await productRepository.findByIdAndCompany(setProductId, companyId);

    if (!product) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    if (product.type !== ProductType.SET) {
      throw new AppError('Bu ürün bir SET değil', 400);
    }

    // Get SET items
    const setItems = await productSetRepository.findBySetProductId(setProductId);

    // Get SET stocks (hazır paketlenmiş)
    const setStocks = await setStockRepository.findBySetProductId(setProductId);
    const totalSetStock = setStocks.reduce((sum, stock) => sum + stock.quantity, 0);
    const totalSetReserved = setStocks.reduce((sum, stock) => sum + stock.reservedQty, 0);

    // Get component stocks (detaylı bilgi)
    const componentStocks = await Promise.all(
      setItems.map(async (item) => {
        const stocks = await stockRepository.getProductStocks(item.componentProductId);
        const totalStock = stocks.reduce((sum, s) => sum + s.quantity, 0);
        const totalReserved = stocks.reduce((sum, s) => sum + s.reservedQty, 0);
        const availableStock = totalStock - totalReserved;
        
        // Bu bileşenden kaç set yapılabilir?
        const setsPossible = item.quantity > 0 
          ? Math.floor(availableStock / item.quantity)
          : 0;

        return {
          componentSku: item.componentSku,
          componentProductId: item.componentProductId,
          quantity: item.quantity, // Set başına kaç adet
          totalStock,
          totalReserved,
          availableStock,
          setsPossible, // Bu bileşenden kaç set yapılabilir
        };
      })
    );

    // Dinamik stok hesaplama (bileşenlerin minimum stokuna göre)
    const calculatedStock = await calculateSetStock(setProductId, warehouseId);

    return {
      ...product,
      setItems,
      setStock: {
        total: totalSetStock,
        reserved: totalSetReserved,
        available: totalSetStock - totalSetReserved,
        byWarehouse: setStocks.map((stock) => ({
          warehouseId: stock.warehouseId,
          warehouseName: (stock as any).warehouse?.name,
          locationId: stock.locationId,
          quantity: stock.quantity,
          reservedQty: stock.reservedQty,
          available: stock.quantity - stock.reservedQty,
        })),
      },
      componentStocks,
      calculatedStock: {
        total: calculatedStock.totalStock,
        fromComponents: calculatedStock.fromComponents,
        fromSetStock: calculatedStock.fromSetStock,
        componentDetails: calculatedStock.componentDetails,
      },
    };
  }

  /**
   * SET ürününü SKU ile getir
   */
  async getSetBySku(companyId: string, sku: string) {
    const product = await productRepository.findBySku(companyId, sku);
    
    if (!product) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    if (product.type !== ProductType.SET) {
      throw new AppError('Bu ürün bir SET değil', 400);
    }

    return this.getSetById(product.id, companyId);
  }

  /**
   * SET picking algoritması
   * 3 durum kontrolü yapar:
   * 1. SET_STOCK > 0 → Hazır paket kullan
   * 2. SET_STOCK = 0 ama COMPONENT_STOCK yeterli → Alt ürünlerden topla
   * 3. COMPONENT_STOCK yetersiz → Hata döndür
   */
  async pickSet(
    setProductId: string,
    companyId: string,
    warehouseId: string,
    quantity: number,
    locationId?: string
  ): Promise<SetPickingResult> {
    const setProduct = await productRepository.findByIdAndCompany(setProductId, companyId);

    if (!setProduct || setProduct.type !== ProductType.SET) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    // Get SET stock
    const setStock = await setStockRepository.findSetStock(setProductId, warehouseId, locationId);
    const setStockQty = setStock ? setStock.quantity - setStock.reservedQty : 0;

    // Durum A: SET_STOCK yeterli
    if (setStockQty >= quantity) {
      return {
        success: true,
        method: 'SET_READY',
        setStockUsed: quantity,
      };
    }

    // Get SET components
    const setItems = await productSetRepository.findBySetProductId(setProductId);

    if (setItems.length === 0) {
      throw new AppError('SET içinde ürün bulunamadı', 400);
    }

    // Check component stocks
    const componentStockCheck = await Promise.all(
      setItems.map(async (item) => {
        const stock = await stockRepository.findStock(
          item.componentProductId,
          warehouseId
        );
        const availableQty = stock ? stock.quantity - stock.reservedQty : 0;
        const requiredQty = item.quantity * quantity;
        
        return {
          sku: item.componentSku,
          productId: item.componentProductId,
          quantity: item.quantity,
          required: requiredQty,
          available: availableQty,
          sufficient: availableQty >= requiredQty,
        };
      })
    );

    // Durum C: Component stoğu yetersiz
    const insufficient = componentStockCheck.filter((c) => !c.sufficient);
    if (insufficient.length > 0) {
      return {
        success: false,
        method: 'INSUFFICIENT',
        missingComponents: insufficient.map((c) => ({
          sku: c.sku,
          required: c.required,
          available: c.available,
        })),
      };
    }

    // Durum B: Component stoğu yeterli
    return {
      success: true,
      method: 'COMPONENTS',
      componentsUsed: componentStockCheck.map((c) => ({
        sku: c.sku,
        quantity: c.required,
        productId: c.productId,
      })),
    };
  }

  /**
   * SET paketleme/üretim
   * Component ürünlerden SET oluşturur
   */
  async packSet(data: PackingData) {
    const { setProductId, warehouseId, locationId, quantity, userId } = data;

    // Get SET product
    const setProduct = await prisma.product.findUnique({
      where: { id: setProductId },
    });

    if (!setProduct || setProduct.type !== ProductType.SET) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    // Get SET components
    const setItems = await productSetRepository.findBySetProductId(setProductId);

    if (setItems.length === 0) {
      throw new AppError('SET içinde ürün bulunamadı', 400);
    }

    return prisma.$transaction(async (tx) => {
      // Check and deduct component stocks
      for (const item of setItems) {
        const requiredQty = item.quantity * quantity;
        
        const stock = await tx.stock.findFirst({
          where: {
            productId: item.componentProductId,
            warehouseId,
          },
        });

        if (!stock) {
          throw new AppError(`Component stok bulunamadı: ${item.componentSku}`, 400);
        }

        const availableQty = stock.quantity - stock.reservedQty;
        if (availableQty < requiredQty) {
          throw new AppError(
            `Yetersiz component stok: ${item.componentSku}. Mevcut: ${availableQty}, Gerekli: ${requiredQty}`,
            400
          );
        }

        // Deduct component stock
        const previousQty = stock.quantity;
        const newQty = previousQty - requiredQty;

        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: newQty },
        });

        // Create stock log
        await tx.stockLog.create({
          data: {
            type: StockLogType.OUT,
            quantity: requiredQty,
            previousQty,
            newQty,
            productId: item.componentProductId,
            warehouseId,
            userId,
            note: `SET paketleme: ${setProduct.sku} (${quantity} adet)`,
            reference: `PACKING:${setProductId}`,
          },
        });
      }

      // Increase SET stock
      const setStock = await setStockRepository.findOrCreateSetStock(
        setProductId,
        warehouseId,
        locationId
      );

      const previousSetQty = setStock.quantity;
      const newSetQty = previousSetQty + quantity;

      await tx.setStock.update({
        where: { id: setStock.id },
        data: { quantity: newSetQty },
      });

      // Create SET stock log
      const components = setItems.map((item) => ({
        sku: item.componentSku,
        qty: item.quantity,
      }));

      await tx.stockLog.create({
        data: {
          type: StockLogType.PACKING_IN,
          quantity,
          previousQty: previousSetQty,
          newQty: newSetQty,
          productId: setProductId,
          warehouseId,
          userId,
          setSku: setProduct.sku,
          components: components as any,
          note: `SET paketleme: ${quantity} adet`,
          reference: `PACKING:${setProductId}`,
        },
      });

      return {
        setProduct: {
          id: setProduct.id,
          sku: setProduct.sku,
          name: setProduct.name,
        },
        quantity,
        previousSetStock: previousSetQty,
        newSetStock: newSetQty,
      };
    });
  }

  /**
   * SET iadesi
   * İki senaryo:
   * 1. Kapalı kutu (isIntact = true) → SET_STOCK artır
   * 2. Bozuk/eksik (isIntact = false) → Component stoklarına ekle
   */
  async returnSet(data: ReturnSetData) {
    const { setProductId, warehouseId, locationId, quantity, isIntact, userId, note } = data;

    const setProduct = await prisma.product.findUnique({
      where: { id: setProductId },
    });

    if (!setProduct || setProduct.type !== ProductType.SET) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    return prisma.$transaction(async (tx) => {
      if (isIntact) {
        // Senaryo 1: Kapalı kutu → SET_STOCK artır
        const setStock = await setStockRepository.findOrCreateSetStock(
          setProductId,
          warehouseId,
          locationId
        );

        const previousQty = setStock.quantity;
        const newQty = previousQty + quantity;

        await tx.setStock.update({
          where: { id: setStock.id },
          data: { quantity: newQty },
        });

        // Create stock log
        await tx.stockLog.create({
          data: {
            type: StockLogType.RETURN_SET_READY,
            quantity,
            previousQty,
            newQty,
            productId: setProductId,
            warehouseId,
            userId,
            setSku: setProduct.sku,
            note: note || 'SET iadesi (kapalı kutu)',
            reference: `RETURN:${setProductId}`,
          },
        });

        return {
          method: 'SET_READY',
          setStock: {
            previous: previousQty,
            new: newQty,
          },
        };
      } else {
        // Senaryo 2: Bozuk/eksik → Component stoklarına ekle
        const setItems = await productSetRepository.findBySetProductId(setProductId);

        const components = [];
        for (const item of setItems) {
          const returnQty = item.quantity * quantity;

          const stock = await stockRepository.findOrCreateStock(
            item.componentProductId,
            warehouseId
          );

          const previousQty = stock.quantity;
          const newQty = previousQty + returnQty;

          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: newQty },
          });

          // Create stock log
          await tx.stockLog.create({
            data: {
              type: StockLogType.RETURN,
              quantity: returnQty,
              previousQty,
              newQty,
              productId: item.componentProductId,
              warehouseId,
              userId,
              note: note || `SET iadesi component: ${setProduct.sku}`,
              reference: `RETURN:${setProductId}`,
            },
          });

          components.push({
            sku: item.componentSku,
            qty: returnQty,
          });
        }

        // Create SET return log
        await tx.stockLog.create({
          data: {
            type: StockLogType.RETURN_SET_COMPONENT,
            quantity,
            previousQty: 0,
            newQty: 0,
            productId: setProductId,
            warehouseId,
            userId,
            setSku: setProduct.sku,
            components: components as any,
            note: note || 'SET iadesi (bozuk/eksik)',
            reference: `RETURN:${setProductId}`,
          },
        });

        return {
          method: 'COMPONENTS',
          components,
        };
      }
    });
  }

  /**
   * SET sil
   */
  async deleteSet(setProductId: string, companyId: string) {
    const setProduct = await productRepository.findByIdAndCompany(setProductId, companyId);

    if (!setProduct || setProduct.type !== ProductType.SET) {
      throw new NotFoundError('SET ürünü bulunamadı');
    }

    return prisma.$transaction(async (tx) => {
      // Delete SET items
      await tx.productSetItem.deleteMany({
        where: { setProductId },
      });

      // Delete SET stocks
      await tx.setStock.deleteMany({
        where: { setProductId },
      });

      // Delete product
      await tx.product.delete({
        where: { id: setProductId },
      });
    });
  }
}

export const productSetService = new ProductSetService();

