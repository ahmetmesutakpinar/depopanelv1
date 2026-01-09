import { useQuery } from '@tanstack/react-query';
import {
  Package,
  ShoppingCart,
  Warehouse,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from 'lucide-react';
import { Card, CardBody, Badge } from '@/components/ui';
import StockAlerts from '@/components/StockAlerts';
import { formatCurrency, formatNumber, getOrderStatusLabel } from '@/utils';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  const { data: productStats, error: productStatsError, isLoading: productStatsLoading } = useQuery({
    queryKey: ['productStats'],
    queryFn: () => api.getProductStats(),
    retry: 2,
    retryDelay: 1000,
  });

  const { data: orderStats, error: orderStatsError, isLoading: orderStatsLoading } = useQuery({
    queryKey: ['orderStats'],
    queryFn: () => api.getOrderStats(),
    retry: 2,
    retryDelay: 1000,
  });

  const { data: lowStockProducts, error: lowStockError, isLoading: lowStockLoading } = useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: () => api.getLowStockProducts(),
    retry: 2,
    retryDelay: 1000,
  });

  const { data: recentOrders, error: recentOrdersError, isLoading: recentOrdersLoading } = useQuery({
    queryKey: ['recentOrders'],
    queryFn: () => api.getOrders({ limit: 5 }),
    retry: 2,
    retryDelay: 1000,
  });

  const { data: dailyOrderedProducts, error: dailyProductsError, isLoading: dailyProductsLoading } = useQuery({
    queryKey: ['dailyOrderedProducts', new Date().toDateString()],
    queryFn: () => api.getDailyOrderedProducts(new Date().toISOString().split('T')[0]),
    retry: 2,
    retryDelay: 1000,
    // Don't show error for this if it fails - it's not critical
    onError: (error: any) => {
      console.warn('Daily ordered products fetch failed:', error);
    },
  });

  const stats = [
    {
      label: 'Toplam Ürün',
      value: formatNumber(productStats?.data?.totalProducts || 0),
      icon: Package,
      color: 'primary',
      change: '+12%',
      changeType: 'up',
    },
    {
      label: 'Stok Değeri',
      value: formatCurrency(productStats?.data?.totalStockValue || 0),
      icon: TrendingUp,
      color: 'success',
      change: '+8%',
      changeType: 'up',
    },
    {
      label: 'Toplam Sipariş',
      value: formatNumber(orderStats?.data?.totalOrders || 0),
      icon: ShoppingCart,
      color: 'accent',
      change: '+24%',
      changeType: 'up',
    },
    {
      label: 'Toplam Ciro',
      value: formatCurrency(orderStats?.data?.totalRevenue || 0),
      icon: Warehouse,
      color: 'warning',
      change: '+18%',
      changeType: 'up',
    },
  ];

  const orderStatusCards = [
    {
      label: 'Bekleyen',
      value: orderStats?.data?.pendingOrders || 0,
      icon: Clock,
      color: 'warning',
    },
    {
      label: 'Paketlendi',
      value: orderStats?.data?.processingOrders || 0,
      icon: Package,
      color: 'primary',
    },
    {
      label: 'Kargoda',
      value: orderStats?.data?.shippedOrders || 0,
      icon: Truck,
      color: 'primary',
    },
    {
      label: 'Teslim Edildi',
      value: orderStats?.data?.deliveredOrders || 0,
      icon: CheckCircle,
      color: 'success',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">
            Merhaba, {user?.firstName} 👋
          </h1>
          <p className="text-secondary-500">
            İşte bugünkü özet bilgileriniz
          </p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="stat-card">
            <CardBody className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  stat.changeType === 'up' ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {stat.changeType === 'up' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {stat.change}
                </div>
              </div>
              <p className="text-2xl font-bold text-secondary-900 mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-secondary-500">{stat.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Stock Alerts */}
      <StockAlerts />

      {/* Order Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {orderStatusCards.map((card, index) => (
          <Card key={index}>
            <CardBody className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 bg-${card.color}-100 rounded-xl flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 text-${card.color}-600`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-secondary-900">{card.value}</p>
                <p className="text-sm text-secondary-500">{card.label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Daily Ordered Products */}
      {dailyOrderedProducts?.data && dailyOrderedProducts.data.length > 0 && (
        <Card>
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-secondary-900">Bugün Sipariş Edilen Ürünler</h2>
            </div>
            <Badge variant="primary">
              {dailyOrderedProducts.data.length} ürün
            </Badge>
          </div>
          <CardBody className="p-0">
            <div className="divide-y divide-secondary-100">
              {dailyOrderedProducts.data.slice(0, 10).map((product: any, index: number) => (
                <div key={product.productId || index} className="flex items-center justify-between p-4 hover:bg-secondary-50">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-secondary-900">{product.productName}</p>
                      <p className="text-sm text-secondary-500">SKU: {product.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary-600 text-lg">
                      {formatNumber(product.totalQuantity)} adet
                    </p>
                    <p className="text-xs text-secondary-500">
                      {product.orderCount} sipariş
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {dailyOrderedProducts.data.length > 10 && (
              <div className="p-4 bg-secondary-50 text-center">
                <p className="text-sm text-secondary-600">
                  +{dailyOrderedProducts.data.length - 10} ürün daha
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Products */}
        <Card>
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-secondary-900">Düşük Stoklu Ürünler</h2>
            <AlertTriangle className="w-5 h-5 text-warning-500" />
          </div>
          <CardBody className="p-0">
            {lowStockProducts?.data?.length > 0 ? (
              <div className="divide-y divide-secondary-100">
                {lowStockProducts.data.slice(0, 5).map((product: any) => (
                  <div key={product.id} className="flex items-center justify-between p-4 hover:bg-secondary-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900">{product.name}</p>
                        <p className="text-sm text-secondary-500">{product.sku}</p>
                      </div>
                    </div>
                    <Badge variant="danger">{product.totalStock} adet</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state py-8">
                <CheckCircle className="w-12 h-12 text-success-500 mb-3" />
                <p className="text-secondary-600">Tüm ürünlerin stoğu yeterli</p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Recent Orders */}
        <Card>
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-secondary-900">Son Siparişler</h2>
            <ShoppingCart className="w-5 h-5 text-primary-500" />
          </div>
          <CardBody className="p-0">
            {recentOrders?.data?.length > 0 ? (
              <div className="divide-y divide-secondary-100">
                {recentOrders.data.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-4 hover:bg-secondary-50">
                    <div>
                      <p className="font-medium text-secondary-900">#{order.orderNumber}</p>
                      <p className="text-sm text-secondary-500">{order.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-secondary-900">
                        {formatCurrency(order.total)}
                      </p>
                      <Badge
                        variant={
                          order.status === 'DELIVERED' ? 'success' :
                          order.status === 'CANCELLED' ? 'danger' :
                          order.status === 'PENDING' ? 'warning' : 'primary'
                        }
                      >
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state py-8">
                <ShoppingCart className="w-12 h-12 text-secondary-300 mb-3" />
                <p className="text-secondary-600">Henüz sipariş yok</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

