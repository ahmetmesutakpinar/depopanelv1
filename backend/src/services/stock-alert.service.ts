/**
 * Stock Alert Service
 * 
 * Düşük stok uyarıları ve alarm sistemi
 */

import { prisma } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { emailService } from './email.service.js';
import { NotFoundError } from '../middleware/error.middleware.js';

export interface LowStockAlert {
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  currentStock: number;
  minQuantity: number;
  difference: number;
  locationId?: string;
  locationCode?: string;
}

export interface StockAlertSummary {
  companyId: string;
  companyName: string;
  totalAlerts: number;
  criticalAlerts: number; // Stock = 0
  warningAlerts: number; // Stock < minQuantity
  alerts: LowStockAlert[];
}

export class StockAlertService {
  /**
   * Tüm şirketler için düşük stok kontrolü yap
   */
  async checkAllCompanies(): Promise<StockAlertSummary[]> {
    logger.info('[STOCK ALERT] Checking low stock for all companies...');

    const companies = await prisma.company.findMany({
      where: {
        status: 'APPROVED',
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const summaries: StockAlertSummary[] = [];

    for (const company of companies) {
      try {
        const summary = await this.checkCompanyStock(company.id);
        
        if (summary.totalAlerts > 0) {
          summaries.push(summary);
          
          // E-mail gönder
          await this.sendAlertEmail(company.email, summary);
        }
      } catch (error) {
        logger.error(`[STOCK ALERT] Error checking company ${company.id}:`, error);
      }
    }

    logger.info(`[STOCK ALERT] Check completed. Found ${summaries.length} companies with alerts.`);

    return summaries;
  }

  /**
   * Belirli bir şirket için düşük stok kontrolü
   */
  async checkCompanyStock(companyId: string): Promise<StockAlertSummary> {
    logger.info(`[STOCK ALERT] Checking stock for company: ${companyId}`);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    // Düşük stoklu ürünleri bul
    // 1) Product.minQuantity > 0 olanları al
    // 2) Stock.quantity <= Product.minQuantity olanları bul
    const lowStockProducts = await prisma.stock.findMany({
      where: {
        product: {
          companyId,
          isActive: true,
          minQuantity: { gt: 0 },
        },
        quantity: {
          lte: prisma.stock.fields.minQuantity,
        },
      },
      select: {
        productId: true,
        warehouseId: true,
        locationId: true,
        quantity: true,
        minQuantity: true,
        product: {
          select: {
            name: true,
            sku: true,
            minQuantity: true,
          },
        },
        warehouse: {
          select: {
            name: true,
          },
        },
        location: {
          select: {
            code: true,
          },
        },
      },
    });

    const alerts: LowStockAlert[] = lowStockProducts.map((stock) => ({
      productId: stock.productId,
      productName: stock.product.name,
      productSku: stock.product.sku,
      warehouseId: stock.warehouseId,
      warehouseName: stock.warehouse.name,
      currentStock: stock.quantity,
      minQuantity: stock.product.minQuantity,
      difference: stock.product.minQuantity - stock.quantity,
      locationId: stock.locationId || undefined,
      locationCode: stock.location?.code || undefined,
    }));

    // Kritik ve uyarı sayıları
    const criticalAlerts = alerts.filter((a) => a.currentStock === 0).length;
    const warningAlerts = alerts.length - criticalAlerts;

    const summary: StockAlertSummary = {
      companyId: company.id,
      companyName: company.name,
      totalAlerts: alerts.length,
      criticalAlerts,
      warningAlerts,
      alerts,
    };

    logger.info(`[STOCK ALERT] Company ${company.name}: ${summary.totalAlerts} alerts found`);

    return summary;
  }

  /**
   * Belirli bir depodaki düşük stokları getir
   */
  async getWarehouseLowStock(
    warehouseId: string,
    companyId: string
  ): Promise<LowStockAlert[]> {
    const lowStockProducts = await prisma.stock.findMany({
      where: {
        warehouseId,
        product: {
          companyId,
          isActive: true,
          minQuantity: { gt: 0 },
        },
        quantity: {
          lte: prisma.stock.fields.minQuantity,
        },
      },
      select: {
        productId: true,
        warehouseId: true,
        locationId: true,
        quantity: true,
        minQuantity: true,
        product: {
          select: {
            name: true,
            sku: true,
            minQuantity: true,
          },
        },
        warehouse: {
          select: {
            name: true,
          },
        },
        location: {
          select: {
            code: true,
          },
        },
      },
    });

    return lowStockProducts.map((stock) => ({
      productId: stock.productId,
      productName: stock.product.name,
      productSku: stock.product.sku,
      warehouseId: stock.warehouseId,
      warehouseName: stock.warehouse.name,
      currentStock: stock.quantity,
      minQuantity: stock.product.minQuantity,
      difference: stock.product.minQuantity - stock.quantity,
      locationId: stock.locationId || undefined,
      locationCode: stock.location?.code || undefined,
    }));
  }

  /**
   * Dashboard için kritik stok widget verisi
   */
  async getCriticalStockWidget(companyId: string): Promise<{
    total: number;
    critical: number;
    warning: number;
    topAlerts: LowStockAlert[];
  }> {
    const summary = await this.checkCompanyStock(companyId);

    // En kritik 10 ürünü getir
    const topAlerts = summary.alerts
      .sort((a, b) => {
        // Önce stok 0 olanlar
        if (a.currentStock === 0 && b.currentStock !== 0) return -1;
        if (a.currentStock !== 0 && b.currentStock === 0) return 1;
        // Sonra fark büyükten küçüğe
        return b.difference - a.difference;
      })
      .slice(0, 10);

    return {
      total: summary.totalAlerts,
      critical: summary.criticalAlerts,
      warning: summary.warningAlerts,
      topAlerts,
    };
  }

  /**
   * E-mail ile uyarı gönder
   */
  private async sendAlertEmail(
    email: string,
    summary: StockAlertSummary
  ): Promise<void> {
    try {
      const subject = `🚨 Düşük Stok Uyarısı - ${summary.companyName}`;

      let html = `
        <h2>Düşük Stok Uyarısı</h2>
        <p>Merhaba,</p>
        <p><strong>${summary.companyName}</strong> için toplam <strong>${summary.totalAlerts}</strong> ürün kritik stok seviyesinde.</p>
        <ul>
          <li>Kritik Uyarılar (Stok = 0): <strong>${summary.criticalAlerts}</strong></li>
          <li>Düşük Stok Uyarıları: <strong>${summary.warningAlerts}</strong></li>
        </ul>
        <h3>Kritik Ürünler:</h3>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Ürün Adı</th>
              <th>Depo</th>
              <th>Mevcut Stok</th>
              <th>Min. Stok</th>
              <th>Fark</th>
            </tr>
          </thead>
          <tbody>
      `;

      // En kritik 20 ürünü göster
      const topAlerts = summary.alerts
        .sort((a, b) => {
          if (a.currentStock === 0 && b.currentStock !== 0) return -1;
          if (a.currentStock !== 0 && b.currentStock === 0) return 1;
          return b.difference - a.difference;
        })
        .slice(0, 20);

      for (const alert of topAlerts) {
        const rowStyle = alert.currentStock === 0 ? 'background-color: #ffcccc;' : '';
        html += `
          <tr style="${rowStyle}">
            <td>${alert.productSku}</td>
            <td>${alert.productName}</td>
            <td>${alert.warehouseName}${alert.locationCode ? ` (${alert.locationCode})` : ''}</td>
            <td>${alert.currentStock}</td>
            <td>${alert.minQuantity}</td>
            <td>${alert.difference}</td>
          </tr>
        `;
      }

      html += `
          </tbody>
        </table>
        <p>Lütfen ilgili ürünleri kontrol edip sipariş verin.</p>
        <p>---<br>DepoPanel WMS</p>
      `;

      await emailService.sendEmail({
        to: email,
        subject,
        html,
      });

      logger.info(`[STOCK ALERT] Alert email sent to: ${email}`);
    } catch (error) {
      logger.error('[STOCK ALERT] Error sending alert email:', error);
    }
  }
}

export const stockAlertService = new StockAlertService();

