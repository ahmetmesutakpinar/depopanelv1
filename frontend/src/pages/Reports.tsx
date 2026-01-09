import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Calendar,
  Download,
  RefreshCw,
  Warehouse,
  AlertTriangle,
  DollarSign,
  Calculator,
} from 'lucide-react';
import {
  Button,
  Badge,
  Card,
  CardBody,
  Select,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui';
import { formatCurrency, formatNumber, formatDate } from '@/utils';
import api from '@/services/api';

type ReportType = 'inventory-turnover' | 'transfer' | 'supply';
type PeriodType = '1month' | '3months' | '6months' | '12months';

const periodDaysMap: Record<PeriodType, number> = {
  '1month': 30,
  '3months': 90,
  '6months': 180,
  '12months': 365,
};

const periodLabelsMap: Record<PeriodType, string> = {
  '1month': '1 Aylık',
  '3months': '3 Aylık',
  '6months': '6 Aylık',
  '12months': '12 Aylık',
};

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>('inventory-turnover');
  const [period, setPeriod] = useState<PeriodType>('1month');

  // Fetch data for reports
  const { data: productsData } = useQuery({
    queryKey: ['products-report'],
    queryFn: () => api.getProducts({ limit: 100 }),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-report', period],
    queryFn: () => {
      const days = periodDaysMap[period];
      
      // Başlangıç tarihi: X gün öncesinin başlangıcı (00:00:00)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      // Bitiş tarihi: Bugünün sonu (23:59:59.999)
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      return api.getOrders({ 
        startDate: startDate.toISOString(), 
        endDate: endDate.toISOString(),
        limit: 10000 // Increased limit for reports to include all historical orders
      });
    },
  });

  const { data: transfersData } = useQuery({
    queryKey: ['transfers-report', period],
    queryFn: () => api.getStockLogs({ type: 'TRANSFER', limit: 500 }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses-report'],
    queryFn: () => api.getWarehouses(),
  });

  const products = productsData?.data || [];
  const orders = ordersData?.data || [];
  const transfers = transfersData?.data || [];
  const warehouses = warehousesData?.data || [];
  
  // Find main warehouse (default warehouse)
  const mainWarehouse = warehouses.find((w: any) => w.isDefault) || warehouses[0];

  // Calculate inventory turnover rate
  const calculateTurnoverRate = (product: any) => {
    const periodDays = periodDaysMap[period];
    
    // Count how many times this product was sold
    let totalSold = 0;
    orders.forEach((order: any) => {
      order.items?.forEach((item: any) => {
        if (item.product?.id === product.id || item.productId === product.id) {
          totalSold += item.quantity;
        }
      });
    });

    const avgStock = product.totalStock || 1;
    const dailySales = totalSold / periodDays;
    const turnoverRate = avgStock > 0 ? (totalSold / avgStock) * (365 / periodDays) : 0;
    const daysOfStock = dailySales > 0 ? Math.round(avgStock / dailySales) : 999;
    
    // Calculate suggested order quantity (to maintain stock for next period)
    const suggestedOrder = Math.max(0, Math.ceil((dailySales * periodDays) - avgStock));
    
    // Calculate suggested order value (cost price * quantity)
    const costPrice = parseFloat(product.costPrice) || parseFloat(product.price) * 0.6 || 0;
    const suggestedOrderValue = suggestedOrder * costPrice;

    return {
      totalSold,
      avgStock,
      dailySales: dailySales.toFixed(2),
      turnoverRate: turnoverRate.toFixed(2),
      daysOfStock,
      suggestedOrder,
      suggestedOrderValue,
      costPrice,
    };
  };

  // Calculate totals for suggested orders
  const turnoverAnalysis = useMemo(() => {
    let totalSuggestedValue = 0;
    let fastMovingCount = 0;
    let slowMovingCount = 0;
    let criticalStockCount = 0;

    const productsWithStats = products.map((product: any) => {
      const stats = calculateTurnoverRate(product);
      const rate = parseFloat(stats.turnoverRate);

      if (rate > 4) fastMovingCount++;
      else if (rate < 1) slowMovingCount++;
      if (product.totalStock <= 5) criticalStockCount++;

      totalSuggestedValue += stats.suggestedOrderValue;

      return { ...product, stats };
    });

    // Sort by turnover rate descending
    productsWithStats.sort((a: any, b: any) => 
      parseFloat(b.stats.turnoverRate) - parseFloat(a.stats.turnoverRate)
    );

    return {
      products: productsWithStats,
      totalSuggestedValue,
      fastMovingCount,
      slowMovingCount,
      criticalStockCount,
    };
  }, [products, orders, period]);

  // Get transfers by warehouse
  const getTransfersByWarehouse = () => {
    const warehouseStats: Record<string, { in: number; out: number; name: string }> = {};
    
    warehouses.forEach((wh: any) => {
      warehouseStats[wh.id] = { in: 0, out: 0, name: wh.name };
    });

    transfers.forEach((transfer: any) => {
      if (warehouseStats[transfer.warehouseId]) {
        warehouseStats[transfer.warehouseId].out += Math.abs(transfer.quantity);
      }
    });

    return Object.entries(warehouseStats).map(([id, data]) => ({
      id,
      ...data,
      net: data.in - data.out,
    }));
  };

  // Calculate supply needs
  const supplyAnalysis = useMemo(() => {
    const needsSupply = turnoverAnalysis.products.filter((p: any) => p.stats.daysOfStock < 30);
    const totalSupplyValue = needsSupply.reduce((sum: number, p: any) => sum + p.stats.suggestedOrderValue, 0);
    
    return {
      products: needsSupply,
      totalValue: totalSupplyValue,
      count: needsSupply.length,
    };
  }, [turnoverAnalysis]);

  // Calculate main warehouse stock summary
  const mainWarehouseSummary = useMemo(() => {
    if (!mainWarehouse) return null;
    
    // Get products with stock in main warehouse
    const productsInMainWarehouse = products.filter((p: any) => {
      const stock = p.stocks?.find((s: any) => s.warehouse?.id === mainWarehouse.id);
      return stock && stock.quantity > 0;
    });
    
    const totalProducts = productsInMainWarehouse.length;
    const lowStockProducts = productsInMainWarehouse.filter((p: any) => {
      const stock = p.stocks?.find((s: any) => s.warehouse?.id === mainWarehouse.id);
      return stock && stock.quantity <= 5;
    });
    
    const totalStockValue = productsInMainWarehouse.reduce((sum: number, p: any) => {
      const stock = p.stocks?.find((s: any) => s.warehouse?.id === mainWarehouse.id);
      const costPrice = parseFloat(p.costPrice) || parseFloat(p.price) * 0.6 || 0;
      return sum + (stock?.quantity || 0) * costPrice;
    }, 0);
    
    return {
      warehouse: mainWarehouse,
      totalProducts,
      lowStockProducts: lowStockProducts.length,
      totalStockValue,
    };
  }, [products, mainWarehouse]);

  const reportTabs = [
    { id: 'inventory-turnover', label: 'Stok Devir Hızı', icon: RefreshCw },
    { id: 'transfer', label: 'Mağazalar Arası Sevkiyat', icon: ArrowLeftRight },
    { id: 'supply', label: 'Tedarik Raporu', icon: ShoppingCart },
  ];

  const periodOptions = [
    { value: '1month', label: '1 Ay' },
    { value: '3months', label: '3 Ay' },
    { value: '6months', label: '6 Ay' },
    { value: '12months', label: '12 Ay' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Raporlar</h1>
          <p className="text-secondary-500">Stok devir hızı, sevkiyat ve tedarik raporları</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodType)}
            className="w-32"
          />
          <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />}>
            Dışa Aktar
          </Button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 border-b border-secondary-200 pb-2 overflow-x-auto">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeReport === tab.id
                ? 'bg-primary-100 text-primary-700'
                : 'text-secondary-600 hover:bg-secondary-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inventory Turnover Report */}
      {activeReport === 'inventory-turnover' && (
        <div className="space-y-6">
          {/* Main Warehouse Overview */}
          {mainWarehouseSummary && (
            <Card className="bg-gradient-to-br from-primary-500 to-primary-600 text-white">
              <CardBody className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Ana Mağaza Stok Durumu</h2>
                    <p className="text-primary-100">{mainWarehouseSummary.warehouse.name}</p>
                  </div>
                  <Warehouse className="w-12 h-12 text-white/80" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-primary-100 text-sm mb-1">Toplam Ürün Çeşidi</p>
                    <p className="text-3xl font-bold">{mainWarehouseSummary.totalProducts}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-primary-100 text-sm mb-1">Düşük Stoklu Ürün</p>
                    <p className="text-3xl font-bold">
                      {mainWarehouseSummary.lowStockProducts > 0 ? (
                        <span className="text-warning-300">{mainWarehouseSummary.lowStockProducts}</span>
                      ) : (
                        <span>0</span>
                      )}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-primary-100 text-sm mb-1">Toplam Stok Değeri</p>
                    <p className="text-3xl font-bold">{formatCurrency(mainWarehouseSummary.totalStockValue)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Toplam Ürün</p>
                    <p className="text-xl font-bold">{products.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-success-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Hızlı Dönen</p>
                    <p className="text-xl font-bold">{turnoverAnalysis.fastMovingCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-warning-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Yavaş Dönen</p>
                    <p className="text-xl font-bold">{turnoverAnalysis.slowMovingCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-danger-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-danger-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Kritik Stok</p>
                    <p className="text-xl font-bold">{turnoverAnalysis.criticalStockCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-gradient-to-br from-primary-500 to-accent-500 text-white">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-white/80">Alınması Gereken</p>
                    <p className="text-xl font-bold">{formatCurrency(turnoverAnalysis.totalSuggestedValue)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Period Info */}
          <Card className="bg-primary-50 border-primary-200">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary-600" />
                  <div>
                    <p className="font-medium text-primary-900">
                      {periodLabelsMap[period]} Stok Devir Analizi
                    </p>
                    <p className="text-sm text-primary-600">
                      Son {periodDaysMap[period]} günlük satış verilerine göre hesaplandı
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-primary-600">Dönem için önerilen sipariş tutarı</p>
                  <p className="text-2xl font-bold text-primary-900">
                    {formatCurrency(turnoverAnalysis.totalSuggestedValue)}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Turnover Table */}
          <Card>
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold text-secondary-900">
                Stok Devir Hızı Analizi
              </h3>
              <Badge variant="primary">{periodLabelsMap[period]}</Badge>
            </div>
            <CardBody className="p-0 overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Ürün</TableHeader>
                    <TableHeader className="text-right">Mevcut Stok</TableHeader>
                    <TableHeader className="text-right">Satılan</TableHeader>
                    <TableHeader className="text-right">Günlük Satış</TableHeader>
                    <TableHeader className="text-right">Devir Hızı</TableHeader>
                    <TableHeader className="text-right">Tahmini Gün</TableHeader>
                    <TableHeader className="text-right">Alınması Gereken</TableHeader>
                    <TableHeader className="text-right">Tutar</TableHeader>
                    <TableHeader>Durum</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {turnoverAnalysis.products.slice(0, 30).map((product: any) => {
                    const rate = parseFloat(product.stats.turnoverRate);
                    
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-secondary-900">{product.name}</p>
                            <p className="text-sm text-secondary-500">{product.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={product.totalStock <= 5 ? 'text-danger-600 font-medium' : ''}>
                            {formatNumber(product.totalStock)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(product.stats.totalSold)}</TableCell>
                        <TableCell className="text-right text-secondary-600">
                          {product.stats.dailySales}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${
                            rate > 4 ? 'text-success-600' : 
                            rate > 1 ? 'text-primary-600' : 
                            'text-danger-600'
                          }`}>
                            {product.stats.turnoverRate}x
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={product.stats.daysOfStock < 14 ? 'text-danger-600 font-medium' : ''}>
                            {product.stats.daysOfStock < 999 ? `${product.stats.daysOfStock} gün` : '∞'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary-600">
                          {product.stats.suggestedOrder > 0 ? formatNumber(product.stats.suggestedOrder) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-secondary-900">
                          {product.stats.suggestedOrderValue > 0 
                            ? formatCurrency(product.stats.suggestedOrderValue) 
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {rate > 4 ? (
                            <Badge variant="success">Hızlı</Badge>
                          ) : rate > 1 ? (
                            <Badge variant="primary">Normal</Badge>
                          ) : (
                            <Badge variant="danger">Yavaş</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Transfer Report */}
      {activeReport === 'transfer' && (
        <div className="space-y-6">
          <Card className="bg-primary-50 border-primary-200">
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="font-medium text-primary-900">
                    {periodLabelsMap[period]} Sevkiyat Raporu
                  </p>
                  <p className="text-sm text-primary-600">
                    Mağazalar arası transfer hareketleri
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="card-header">
              <h3 className="font-semibold text-secondary-900">
                Mağazalar Arası Sevkiyat Özeti
              </h3>
            </div>
            <CardBody className="p-0">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Depo</TableHeader>
                    <TableHeader className="text-right">Giren</TableHeader>
                    <TableHeader className="text-right">Çıkan</TableHeader>
                    <TableHeader className="text-right">Net</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getTransfersByWarehouse().map((stat) => (
                    <TableRow key={stat.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-secondary-400" />
                          <span className="font-medium">{stat.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-success-600 font-medium">
                        +{formatNumber(stat.in)}
                      </TableCell>
                      <TableCell className="text-right text-danger-600 font-medium">
                        -{formatNumber(stat.out)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${stat.net >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          {stat.net >= 0 ? '+' : ''}{formatNumber(stat.net)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>

          {/* Recent Transfers */}
          <Card>
            <div className="card-header">
              <h3 className="font-semibold text-secondary-900">Son Sevkiyatlar</h3>
            </div>
            <CardBody className="p-0">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Tarih</TableHeader>
                    <TableHeader>Ürün</TableHeader>
                    <TableHeader>Kaynak</TableHeader>
                    <TableHeader className="text-right">Miktar</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transfers.slice(0, 15).map((transfer: any) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="text-sm text-secondary-500">
                        {formatDate(transfer.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {transfer.product?.name || 'Bilinmiyor'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{transfer.warehouse?.code || '-'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(Math.abs(transfer.quantity))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {transfers.length === 0 && (
                <div className="empty-state py-8">
                  <ArrowLeftRight className="w-12 h-12 text-secondary-300 mb-3" />
                  <p className="text-secondary-500">Sevkiyat kaydı bulunamadı</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

          {/* Supply Report */}
      {activeReport === 'supply' && (
        <div className="space-y-6">
          {/* Main Warehouse Supply Needs */}
          {mainWarehouseSummary && (
            <Card className="bg-gradient-to-br from-warning-500 to-danger-500 text-white">
              <CardBody className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Ana Mağaza Tedarik İhtiyacı</h2>
                    <p className="text-warning-100">{mainWarehouseSummary.warehouse.name}</p>
                  </div>
                  <ShoppingCart className="w-12 h-12 text-white/80" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-warning-100 text-sm mb-1">Tedarik Gereken Ürün Sayısı</p>
                    <p className="text-3xl font-bold">{supplyAnalysis.count}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-warning-100 text-sm mb-1">Toplam Tedarik Tutarı</p>
                    <p className="text-3xl font-bold">{formatCurrency(supplyAnalysis.totalValue)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Toplam Sipariş</p>
                    <p className="text-xl font-bold">{orders.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-success-600" />
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500">Toplam Ciro</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(orders.reduce((sum: number, o: any) => sum + parseFloat(o.total || 0), 0))}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-gradient-to-br from-warning-500 to-danger-500 text-white">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-white/80">Acil Tedarik Tutarı</p>
                    <p className="text-xl font-bold">{formatCurrency(supplyAnalysis.totalValue)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Period Info */}
          <Card className="bg-warning-50 border-warning-200">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                  <div>
                    <p className="font-medium text-warning-900">
                      {supplyAnalysis.count} Ürün Tedarik Gerektiriyor
                    </p>
                    <p className="text-sm text-warning-600">
                      30 gün içinde tükenecek ürünler ({periodLabelsMap[period]} analizi)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-warning-600">Toplam sipariş tutarı</p>
                  <p className="text-2xl font-bold text-warning-900">
                    {formatCurrency(supplyAnalysis.totalValue)}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Products needing restock */}
          <Card>
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold text-secondary-900">Tedarik Gereken Ürünler</h3>
              <Badge variant="warning">{supplyAnalysis.count} ürün</Badge>
            </div>
            <CardBody className="p-0 overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Ürün</TableHeader>
                    <TableHeader className="text-right">Mevcut Stok</TableHeader>
                    <TableHeader className="text-right">Günlük Satış</TableHeader>
                    <TableHeader className="text-right">Tahmini Tükenme</TableHeader>
                    <TableHeader className="text-right">Önerilen Adet</TableHeader>
                    <TableHeader className="text-right">Birim Maliyet</TableHeader>
                    <TableHeader className="text-right">Toplam Tutar</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {supplyAnalysis.products.map((product: any) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-secondary-900">{product.name}</p>
                          <p className="text-sm text-secondary-500">{product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={product.totalStock <= 5 ? 'text-danger-600 font-bold' : 'font-medium'}>
                          {formatNumber(product.totalStock)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-secondary-600">
                        {product.stats.dailySales}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={product.stats.daysOfStock < 7 ? 'danger' : 'warning'}>
                          {product.stats.daysOfStock} gün
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary-600">
                        {formatNumber(product.stats.suggestedOrder)} adet
                      </TableCell>
                      <TableCell className="text-right text-secondary-600">
                        {formatCurrency(product.stats.costPrice)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-secondary-900">
                        {formatCurrency(product.stats.suggestedOrderValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {supplyAnalysis.products.length === 0 && (
                <div className="empty-state py-8">
                  <Package className="w-12 h-12 text-secondary-300 mb-3" />
                  <p className="text-secondary-500">Tedarik gerektiren ürün yok</p>
                  <p className="text-sm text-secondary-400 mt-1">Tüm ürünlerin stoğu yeterli</p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Total Summary */}
          {supplyAnalysis.products.length > 0 && (
            <Card className="bg-secondary-900 text-white">
              <CardBody className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-secondary-400 mb-1">Dönem: {periodLabelsMap[period]}</p>
                    <p className="text-lg">
                      Toplam <span className="font-bold text-primary-400">{supplyAnalysis.count}</span> ürün için
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-secondary-400 mb-1">Alınması Gereken Toplam Tutar</p>
                    <p className="text-3xl font-bold text-white">
                      {formatCurrency(supplyAnalysis.totalValue)}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
