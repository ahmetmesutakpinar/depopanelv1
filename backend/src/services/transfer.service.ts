import { Transfer, TransferStatus } from '@prisma/client';
import { transferRepository, TransferWithDetails } from '../repositories/transfer.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/index.js';

export interface CreateTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
    notes?: string;
  }[];
}

export class TransferService {
  /**
   * Transfer kodu oluştur
   */
  private generateTransferCode(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    
    return `TRF-${year}${month}${day}-${random}`;
  }

  /**
   * Transferleri listele
   */
  async getTransfers(
    companyId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: TransferStatus;
      fromWarehouseId?: string;
      toWarehouseId?: string;
      search?: string;
    }
  ): Promise<{ transfers: TransferWithDetails[]; total: number; page: number; limit: number }> {
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 20, 100);
    const skip = (page - 1) * limit;

    const result = await transferRepository.findByCompany(companyId, {
      skip,
      take: limit,
      status: options?.status,
      fromWarehouseId: options?.fromWarehouseId,
      toWarehouseId: options?.toWarehouseId,
      search: options?.search,
    });

    return {
      ...result,
      page,
      limit,
    };
  }

  /**
   * Transfer detayı getir
   */
  async getTransferById(id: string, companyId: string): Promise<TransferWithDetails> {
    const transfer = await transferRepository.findByIdAndCompany(id, companyId);
    
    if (!transfer) {
      throw AppError.notFound('Transfer bulunamadı');
    }

    return transfer;
  }

  /**
   * Yeni transfer oluştur
   */
  async createTransfer(
    data: CreateTransferInput,
    companyId: string,
    userId: string
  ): Promise<Transfer> {
    // Validasyon
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw AppError.badRequest('Kaynak ve hedef depo aynı olamaz');
    }

    if (!data.items || data.items.length === 0) {
      throw AppError.badRequest('Transfer en az bir ürün içermelidir');
    }

    // Benzersiz kod oluştur
    let code: string;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
      code = this.generateTransferCode();
      exists = await transferRepository.existsByCode(code, companyId);
      attempts++;
    }

    if (exists) {
      throw AppError.internal('Transfer kodu oluşturulamadı');
    }

    logger.info(`Creating transfer: ${code!} from ${data.fromWarehouseId} to ${data.toWarehouseId}`);

    const transfer = await transferRepository.create({
      code: code!,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      notes: data.notes,
      createdById: userId,
      companyId,
      items: data.items,
    });

    logger.info(`Transfer created: ${transfer.id}`);

    return transfer;
  }

  /**
   * Transfer onayla
   */
  async approveTransfer(
    id: string,
    companyId: string,
    userId: string
  ): Promise<Transfer> {
    const transfer = await this.getTransferById(id, companyId);

    if (transfer.status !== 'PENDING') {
      throw AppError.badRequest('Sadece bekleyen transferler onaylanabilir');
    }

    logger.info(`Approving transfer: ${transfer.code}`);

    const updated = await transferRepository.update(id, companyId, {
      status: 'IN_TRANSIT',
      approvedById: userId,
      approvedAt: new Date(),
      shippedAt: new Date(),
    });

    logger.info(`Transfer approved and shipped: ${transfer.code}`);

    return updated;
  }

  /**
   * Transfer tamamla (stok hareketi yap)
   */
  async completeTransfer(
    id: string,
    companyId: string,
    userId: string
  ): Promise<Transfer> {
    const transfer = await this.getTransferById(id, companyId);

    if (transfer.status !== 'IN_TRANSIT') {
      throw AppError.badRequest('Sadece yoldaki transferler tamamlanabilir');
    }

    logger.info(`Completing transfer: ${transfer.code}`);

    // Transaction içinde stok işlemleri yap
    const updated = await prisma.$transaction(async (tx) => {
      // Her item için stok hareketi yap
      for (const item of transfer.items) {
        // Kaynak depodan stok düş (OUT)
        await stockRepository.decreaseStock(
          item.productId,
          item.variantId || undefined,
          transfer.fromWarehouseId,
          item.quantity,
          undefined,
          companyId
        );

        // Hedef depoya stok ekle (IN)
        await stockRepository.increaseStock(
          item.productId,
          item.variantId || undefined,
          transfer.toWarehouseId,
          item.quantity,
          undefined,
          companyId
        );

        // StockLog kaydet (TRANSFER tipi)
        await prisma.stockLog.create({
          data: {
            type: 'TRANSFER',
            quantity: item.quantity,
            previousQty: 0, // Hesaplanabilir ama şimdilik 0
            newQty: 0, // Hesaplanabilir ama şimdilik 0
            note: `Transfer: ${transfer.code} (${transfer.fromWarehouse.name} → ${transfer.toWarehouse.name})`,
            reference: transfer.code,
            productId: item.productId,
            variantId: item.variantId,
            warehouseId: transfer.toWarehouseId, // Hedef depo
            userId,
          },
        });
      }

      // Transfer durumunu güncelle
      return tx.transfer.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedById: userId,
          completedAt: new Date(),
        },
      });
    });

    logger.info(`Transfer completed: ${transfer.code}`);

    return updated;
  }

  /**
   * Transfer iptal et
   */
  async cancelTransfer(
    id: string,
    companyId: string,
    reason?: string
  ): Promise<Transfer> {
    const transfer = await this.getTransferById(id, companyId);

    if (transfer.status === 'COMPLETED') {
      throw AppError.badRequest('Tamamlanan transferler iptal edilemez');
    }

    if (transfer.status === 'CANCELLED') {
      throw AppError.badRequest('Transfer zaten iptal edilmiş');
    }

    logger.info(`Cancelling transfer: ${transfer.code}`);

    const updated = await transferRepository.update(id, companyId, {
      status: 'CANCELLED',
      notes: reason ? `${transfer.notes || ''}\n[İPTAL] ${reason}` : (transfer.notes || undefined),
    });

    logger.info(`Transfer cancelled: ${transfer.code}`);

    return updated;
  }

  /**
   * Transfer sil (sadece PENDING durumunda)
   */
  async deleteTransfer(id: string, companyId: string): Promise<void> {
    const transfer = await this.getTransferById(id, companyId);

    if (transfer.status !== 'PENDING') {
      throw AppError.badRequest('Sadece bekleyen transferler silinebilir');
    }

    logger.info(`Deleting transfer: ${transfer.code}`);

    await transferRepository.delete(id, companyId);

    logger.info(`Transfer deleted: ${transfer.code}`);
  }

  /**
   * Transfer item ekle
   */
  async addItem(
    transferId: string,
    companyId: string,
    item: {
      productId: string;
      variantId?: string;
      quantity: number;
      notes?: string;
    }
  ): Promise<void> {
    const transfer = await this.getTransferById(transferId, companyId);

    if (transfer.status !== 'PENDING') {
      throw AppError.badRequest('Sadece bekleyen transferlere ürün eklenebilir');
    }

    logger.info(`Adding item to transfer: ${transfer.code}`);

    await transferRepository.addItem(transferId, companyId, item);
  }

  /**
   * Transfer item güncelle
   */
  async updateItem(
    transferId: string,
    itemId: string,
    companyId: string,
    data: {
      quantity?: number;
      notes?: string;
    }
  ): Promise<void> {
    const transfer = await this.getTransferById(transferId, companyId);

    if (transfer.status !== 'PENDING') {
      throw AppError.badRequest('Sadece bekleyen transferlerin ürünleri güncellenebilir');
    }

    logger.info(`Updating item in transfer: ${transfer.code}`);

    await transferRepository.updateItem(itemId, transferId, companyId, data);
  }

  /**
   * Transfer item sil
   */
  async deleteItem(
    transferId: string,
    itemId: string,
    companyId: string
  ): Promise<void> {
    const transfer = await this.getTransferById(transferId, companyId);

    if (transfer.status !== 'PENDING') {
      throw AppError.badRequest('Sadece bekleyen transferlerin ürünleri silinebilir');
    }

    // Son item silinmesin
    if (transfer.items.length === 1) {
      throw AppError.badRequest('Transfer en az bir ürün içermelidir');
    }

    logger.info(`Deleting item from transfer: ${transfer.code}`);

    await transferRepository.deleteItem(itemId, transferId, companyId);
  }
}

export const transferService = new TransferService();

