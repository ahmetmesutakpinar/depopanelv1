import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  ShoppingCart,
  Search,
  Eye,
  Truck,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  X,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Camera,
  Keyboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Input,
  Modal,
  Badge,
  Card,
  CardBody,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  Select,
} from '@/components/ui';
import BulkActions from '@/components/BulkActions';
import { exportToCSV, formatCurrencyForExport, formatDateTimeForExport } from '@/utils/export';
import {
  formatCurrency,
  formatDateTime,
  getOrderStatusLabel,
  getOrderStatusColor,
  cn,
} from '@/utils';
import api from '@/services/api';
import type { Order, OrderStatus, CreateOrderData } from '@/utils/types';

// ===== ORDERS TAB COMPONENT =====
function OrdersTab() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [newStatus, setNewStatus] = useState<OrderStatus>('PENDING');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [cargoCompany, setCargoCompany] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    shippingAddress: '',
    shippingCity: '',
    shippingDistrict: '',
    shippingPostalCode: '',
    warehouseId: '',
    customerNote: '',
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', page, search, statusFilter],
    queryFn: () => {
      // Handle "COMPLETED" virtual filter - show PROCESSING, SHIPPED, DELIVERED
      if (statusFilter === 'COMPLETED') {
        // We'll need to fetch all and filter, or modify backend
        // For now, let's use PROCESSING as the main completed status
        return api.getOrders({ 
          page, 
          limit: 20, 
          search,
          status: 'PROCESSING',
        });
      }
      return api.getOrders({ 
        page, 
        limit: 20, 
        search,
        ...(statusFilter && statusFilter !== 'COMPLETED' && { status: statusFilter as OrderStatus }),
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      api.updateOrderStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      toast.success('Sipariş durumu güncellendi');
      setIsStatusModalOpen(false);
      setSelectedOrder(null);
    },
  });

  // Get products and warehouses for create order form
  const { data: productsData } = useQuery({
    queryKey: ['products-for-order'],
    queryFn: () => api.getProducts({ limit: 1000, isActive: true }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.getIntegrations(),
    retry: false,
    refetchOnWindowFocus: false,
    onError: () => {
      // Sessizce handle et
    },
  });

  const handleSyncOrders = async () => {
    const integrations = integrationsData?.data || [];
    const activeIntegrations = integrations.filter((i: any) => i.isActive);
    
    if (activeIntegrations.length === 0) {
      toast.error('Aktif entegrasyon bulunamadı');
      return;
    }

    setIsSyncing(true);
    try {
      for (const integration of activeIntegrations) {
        await api.syncIntegration(integration.id);
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success('Siparişler senkronize edildi');
      
      // ✅ OTOMATIK REFRESH: Senkronizasyon tamamlandıktan sonra sayfayı yenile
      setTimeout(() => {
        window.location.reload();
      }, 5000); // Senkronizasyonun tamamlanması için bekle
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Senkronizasyon başarısız');
    } finally {
      setIsSyncing(false);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: (data: CreateOrderData) => api.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success('Sipariş oluşturuldu');
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Sipariş oluşturulamadı');
    },
  });

  const products = productsData?.data || [];
  const warehouses = warehousesData?.data || [];

  // ✅ FIX: Helper function to find product by SKU (case-insensitive)
  const findProductBySku = (sku: string | null | undefined): any => {
    if (!sku) return null;
    return products.find((p: any) => 
      p.sku?.toUpperCase().trim() === sku.toUpperCase().trim() && 
      p.isActive
    ) || null;
  };

  // ✅ FIX: Check if order item is linked (by productId OR SKU match)
  const isOrderItemLinked = (item: any): boolean => {
    return !!(item.productId || findProductBySku(item.sku));
  };

  // ✅ FIX: Get matched product for order item (by productId or SKU)
  const getMatchedProduct = (item: any): any => {
    if (item.productId && item.product) {
      return item.product;
    }
    return findProductBySku(item.sku);
  };

  const resetCreateForm = () => {
    setOrderForm({
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      shippingAddress: '',
      shippingCity: '',
      shippingDistrict: '',
      shippingPostalCode: '',
      warehouseId: '',
      customerNote: '',
    });
    setOrderItems([]);
  };

  const addOrderItem = () => {
    setOrderItems([...orderItems, { productId: '', quantity: 1 }]);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index: number, field: 'productId' | 'quantity', value: string | number) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  const handleCreateOrder = () => {
    if (!orderForm.customerName || !orderForm.shippingAddress) {
      toast.error('Müşteri adı ve adres zorunludur');
      return;
    }

    if (orderItems.length === 0) {
      toast.error('En az bir ürün eklemelisiniz');
      return;
    }

    const invalidItems = orderItems.filter(item => !item.productId || item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.error('Tüm ürünler seçilmeli ve miktar 0\'dan büyük olmalıdır');
      return;
    }

    createOrderMutation.mutate({
      ...orderForm,
      items: orderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  };

  // Bulk actions
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: OrderStatus }) => {
      return api.bulkUpdateOrderStatus({ orderIds: ids, status });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      toast.success(`${data.data?.updated || selectedOrders.length} sipariş durumu güncellendi`);
      setSelectedOrders([]);
    },
  });

  const bulkCancelMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const promises = ids.map((id) => api.cancelOrder(id));
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success(`${selectedOrders.length} sipariş iptal edildi`);
      setSelectedOrders([]);
    },
  });

  const handleBulkExport = (items: Order[]) => {
    exportToCSV(
      items,
      [
        { key: 'orderNumber', label: 'Sipariş No' },
        { key: 'customerName', label: 'Müşteri' },
        { key: 'customerPhone', label: 'Telefon' },
        { key: 'total', label: 'Tutar', format: formatCurrencyForExport },
        { key: 'status', label: 'Durum' },
        { key: 'createdAt', label: 'Tarih', format: formatDateTimeForExport },
      ],
      { filename: 'siparisler' }
    );
  };

  const handleStatusUpdate = () => {
    if (!selectedOrder) return;

    updateStatusMutation.mutate({
      id: selectedOrder.id,
      data: {
        status: newStatus,
        ...(trackingNumber && { trackingNumber }),
        ...(cargoCompany && { cargoCompany }),
      },
    });
  };

  const openStatusModal = (order: Order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setTrackingNumber(order.trackingNumber || '');
    setCargoCompany(order.cargoCompany || '');
    setIsStatusModalOpen(true);
  };

  const openDetailModal = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      // Genel durumlar
      case 'PENDING': return Clock;
      case 'PROCESSING': return Package;
      case 'SHIPPED': return Truck;
      case 'DELIVERED': return CheckCircle;
      case 'CANCELLED': return XCircle;
      case 'NEW': return Clock;
      case 'PAID': return Package;
      case 'READY_TO_PICK': return Clock;
      case 'PICKED': return Package;
      case 'PACKED': return Package;
      // WooCommerce durumları
      case 'WC_PENDING': return Clock;
      case 'WC_PROCESSING': return Package;
      case 'WC_ON_HOLD': return Clock;
      case 'WC_COMPLETED': return CheckCircle;
      case 'WC_CANCELLED': return XCircle;
      case 'WC_REFUNDED': return RotateCcw;
      case 'WC_FAILED': return XCircle;
      case 'WC_SHIPPED': return Truck;
      case 'WC_DELIVERED': return CheckCircle;
      case 'WC_TRASH': return XCircle;
      default: return Clock;
    }
  };

  const orders = ordersData?.data || [];
  const pagination = ordersData?.pagination;

  const statusOptions = [
    { value: '', label: 'Tüm Durumlar' },
    // Genel durumlar
    { value: 'PENDING', label: 'Hazırlanıyor' },
    { value: 'PROCESSING', label: 'Paketlendi' },
    { value: 'SHIPPED', label: 'Kargoda' },
    { value: 'DELIVERED', label: 'Teslim Edildi' },
    { value: 'CANCELLED', label: 'İptal Edildi' },
    { value: 'COMPLETED', label: 'Tamamlanan Siparişler' }, // Virtual filter for PROCESSING, SHIPPED, DELIVERED
    // WooCommerce durumları
    { value: 'WC_PENDING', label: 'Ödeme Bekleniyor' },
    { value: 'WC_PROCESSING', label: 'Hazırlanıyor' },
    { value: 'WC_ON_HOLD', label: 'Beklemede' },
    { value: 'WC_COMPLETED', label: 'Tamamlandı' },
    { value: 'WC_CANCELLED', label: 'İptal Edildi' },
    { value: 'WC_REFUNDED', label: 'İade Edildi' },
    { value: 'WC_FAILED', label: 'Başarısız' },
    { value: 'WC_SHIPPED', label: 'Kargoya Verildi' },
    { value: 'WC_DELIVERED', label: 'Teslim Edildi' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={handleSyncOrders}
          isLoading={isSyncing}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Senkronize Et
        </Button>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni Sipariş
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Sipariş no, müşteri adı ara..."
                leftIcon={<Search className="w-5 h-5" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            />
          </div>
        </CardBody>
      </Card>

      {/* Bulk Actions */}
      {selectedOrders.length > 0 && (
        <BulkActions
          selectedItems={selectedOrders}
          items={orders}
          onSelectAll={(selected) => {
            setSelectedOrders(selected ? orders.map((o) => o.id) : []);
          }}
          onBulkDelete={(ids) => {
            bulkCancelMutation.mutate(ids);
          }}
          onBulkExport={handleBulkExport}
          getItemId={(item) => item.id}
          actions={[
            {
              label: 'Hazırlanıyor Yap',
              onClick: (ids) => {
                bulkUpdateStatusMutation.mutate({ ids, status: 'PENDING' });
              },
            },
            {
              label: 'Paketlendi Yap',
              onClick: (ids) => {
                bulkUpdateStatusMutation.mutate({ ids, status: 'PROCESSING' });
              },
            },
            {
              label: 'Kargoya Ver',
              onClick: (ids) => {
                bulkUpdateStatusMutation.mutate({ ids, status: 'SHIPPED' });
              },
            },
          ]}
        />
      )}

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : orders.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedOrders.length === orders.length && orders.length > 0}
                      onChange={(e) => {
                        setSelectedOrders(e.target.checked ? orders.map((o) => o.id) : []);
                      }}
                      className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                    />
                  </TableHeader>
                  <TableHeader>Sipariş</TableHeader>
                  <TableHeader>Müşteri</TableHeader>
                  <TableHeader>Kaynak</TableHeader>
                  <TableHeader>Tutar</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader className="w-12">
                    <span className="sr-only">İşlemler</span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order: Order) => {
                  const StatusIcon = getStatusIcon(order.status);
                  const isSelected = selectedOrders.includes(order.id);
                  return (
                    <TableRow key={order.id} className={isSelected ? 'bg-primary-50' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrders([...selectedOrders, order.id]);
                            } else {
                              setSelectedOrders(selectedOrders.filter((id) => id !== order.id));
                            }
                          }}
                          className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openDetailModal(order)}
                          className="text-primary-600 hover:text-primary-700 font-medium"
                        >
                          #{order.orderNumber}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-secondary-900">
                            {order.customerName}
                          </p>
                          {order.customerPhone && (
                            <p className="text-sm text-secondary-500">
                              {order.customerPhone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.integration ? (
                          <Badge variant="primary">
                            {order.integration.name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Manuel</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(order.total)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openStatusModal(order)}
                          className="flex items-center gap-2 hover:opacity-80"
                        >
                          <Badge variant={getOrderStatusColor(order.status) as any}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {getOrderStatusLabel(order.status)}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-secondary-500">
                        {formatDateTime(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openDetailModal(order)}
                          className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <ShoppingCart className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Sipariş bulunamadı
              </h3>
              <p className="text-secondary-500">
                {search || statusFilter
                  ? 'Filtrelere uygun sipariş yok'
                  : 'Henüz sipariş yok'}
              </p>
            </div>
          )}
        </CardBody>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-100">
            <p className="text-sm text-secondary-500">
              Toplam {pagination.total} sipariş
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Önceki
              </Button>
              <span className="text-sm text-secondary-600">
                Sayfa {page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Order Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedOrder(null);
        }}
        title={`Sipariş #${selectedOrder?.orderNumber}`}
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center justify-between p-4 bg-secondary-50 rounded-xl">
              <div>
                <p className="text-sm text-secondary-500">Durum</p>
                <Badge
                  variant={getOrderStatusColor(selectedOrder.status) as any}
                  className="mt-1"
                >
                  {getOrderStatusLabel(selectedOrder.status)}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-sm text-secondary-500">Toplam</p>
                <p className="text-xl font-bold text-secondary-900">
                  {formatCurrency(selectedOrder.total)}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h4 className="font-medium text-secondary-900 mb-3">Müşteri Bilgileri</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-secondary-500">Ad Soyad</p>
                  <p className="font-medium">{selectedOrder.customerName}</p>
                </div>
                {selectedOrder.customerPhone && (
                  <div>
                    <p className="text-secondary-500">Telefon</p>
                    <p className="font-medium">{selectedOrder.customerPhone}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-secondary-500">Adres</p>
                  <p className="font-medium">
                    {selectedOrder.shippingAddress}
                    {selectedOrder.shippingCity && `, ${selectedOrder.shippingCity}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-secondary-900">Ürünler</h4>
              </div>
              <div className="space-y-3">
                {selectedOrder.items.map((item) => {
                  const matchedProduct = getMatchedProduct(item);
                  const isLinked = isOrderItemLinked(item);
                  
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isLinked ? 'bg-secondary-50' : 'bg-warning-50 border border-warning-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isLinked ? 'bg-white' : 'bg-warning-100'
                        }`}>
                          <Package className={`w-5 h-5 ${isLinked ? 'text-secondary-400' : 'text-warning-600'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-secondary-900">
                              {matchedProduct?.name || item.name}
                            </p>
                            {isLinked ? (
                              <Badge variant="success" className="text-xs">Bağlı</Badge>
                            ) : (
                              <Badge variant="warning" className="text-xs">Çözümlenmedi</Badge>
                            )}
                          </div>
                          <p className="text-sm text-secondary-500">
                            SKU: {item.sku} • {item.quantity} x {formatCurrency(item.unitPrice)}
                          </p>
                          {matchedProduct && (
                            <p className="text-xs text-secondary-400 mt-1">
                              Stok: {matchedProduct.availableStock || 0} adet
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="font-medium">{formatCurrency(item.total)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tracking Info */}
            {selectedOrder.trackingNumber && (
              <div className="p-4 bg-primary-50 rounded-xl">
                <div className="flex items-center gap-2 text-primary-700">
                  <Truck className="w-5 h-5" />
                  <span className="font-medium">Kargo Takip</span>
                </div>
                <p className="mt-2 text-sm">
                  {selectedOrder.cargoCompany && `${selectedOrder.cargoCompany}: `}
                  <span className="font-mono">{selectedOrder.trackingNumber}</span>
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
              <Button
                variant="secondary"
                onClick={() => setIsDetailModalOpen(false)}
              >
                Kapat
              </Button>
              <Button onClick={() => {
                setIsDetailModalOpen(false);
                openStatusModal(selectedOrder);
              }}>
                Durumu Güncelle
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Status Update Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedOrder(null);
        }}
        title="Sipariş Durumunu Güncelle"
      >
        <div className="space-y-5">
          <Select
            label="Yeni Durum"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
            options={[
              { value: 'PENDING', label: 'Hazırlanıyor' },
              { value: 'PROCESSING', label: 'Paketlendi' },
              { value: 'SHIPPED', label: 'Kargoya Verildi' },
              { value: 'DELIVERED', label: 'Teslim Edildi' },
            ]}
          />

          {(newStatus === 'SHIPPED' || newStatus === 'DELIVERED') && (
            <>
              <Input
                label="Kargo Firması"
                placeholder="Aras, Yurtiçi, MNG..."
                value={cargoCompany}
                onChange={(e) => setCargoCompany(e.target.value)}
              />
              <Input
                label="Takip Numarası"
                placeholder="123456789"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsStatusModalOpen(false)}
            >
              İptal
            </Button>
            <Button
              onClick={handleStatusUpdate}
              isLoading={updateStatusMutation.isPending}
            >
              Güncelle
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Order Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          resetCreateForm();
        }}
        title="Yeni Sipariş Oluştur"
        size="lg"
      >
        <div className="space-y-5">
          {/* Customer Info */}
          <div>
            <h4 className="font-medium text-secondary-900 mb-3">Müşteri Bilgileri</h4>
            <div className="space-y-3">
              <Input
                label="Müşteri Adı *"
                placeholder="Ad Soyad"
                value={orderForm.customerName}
                onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="E-posta"
                  type="email"
                  placeholder="ornek@email.com"
                  value={orderForm.customerEmail}
                  onChange={(e) => setOrderForm({ ...orderForm, customerEmail: e.target.value })}
                />
                <Input
                  label="Telefon"
                  placeholder="0555 123 45 67"
                  value={orderForm.customerPhone}
                  onChange={(e) => setOrderForm({ ...orderForm, customerPhone: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div>
            <h4 className="font-medium text-secondary-900 mb-3">Teslimat Adresi</h4>
            <div className="space-y-3">
              <Input
                label="Adres *"
                placeholder="Mahalle, Sokak, Bina No"
                value={orderForm.shippingAddress}
                onChange={(e) => setOrderForm({ ...orderForm, shippingAddress: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="İl"
                  placeholder="İstanbul"
                  value={orderForm.shippingCity}
                  onChange={(e) => setOrderForm({ ...orderForm, shippingCity: e.target.value })}
                />
                <Input
                  label="İlçe"
                  placeholder="Kadıköy"
                  value={orderForm.shippingDistrict}
                  onChange={(e) => setOrderForm({ ...orderForm, shippingDistrict: e.target.value })}
                />
                <Input
                  label="Posta Kodu"
                  placeholder="34000"
                  value={orderForm.shippingPostalCode}
                  onChange={(e) => setOrderForm({ ...orderForm, shippingPostalCode: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Warehouse */}
          <div>
            <Select
              label="Depo"
              value={orderForm.warehouseId}
              onChange={(e) => setOrderForm({ ...orderForm, warehouseId: e.target.value })}
              options={[
                { value: '', label: 'Depo seçin' },
                ...warehouses.map((w: any) => ({ value: w.id, label: w.name })),
              ]}
            />
          </div>

          {/* Order Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-secondary-900">Ürünler *</h4>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addOrderItem}
              >
                <Plus className="w-4 h-4 mr-1" />
                Ürün Ekle
              </Button>
            </div>
            <div className="space-y-3">
              {orderItems.length === 0 ? (
                <div className="text-center py-8 text-secondary-500">
                  Henüz ürün eklenmedi
                </div>
              ) : (
                orderItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg">
                    <div className="flex-1">
                      <Select
                        value={item.productId}
                        onChange={(e) => updateOrderItem(index, 'productId', e.target.value)}
                        options={[
                          { value: '', label: 'Ürün seçin' },
                          ...products.map((p: any) => ({ value: p.id, label: `${p.sku} - ${p.name}` })),
                        ]}
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        placeholder="Miktar"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOrderItem(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Customer Note */}
          <div>
            <label className="label">Müşteri Notu</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Sipariş ile ilgili notlar..."
              value={orderForm.customerNote}
              onChange={(e) => setOrderForm({ ...orderForm, customerNote: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateModalOpen(false);
                resetCreateForm();
              }}
            >
              İptal
            </Button>
            <Button
              onClick={handleCreateOrder}
              isLoading={createOrderMutation.isPending}
            >
              Sipariş Oluştur
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== RETURNS TAB COMPONENT =====
function ReturnsTab() {
  const queryClient = useQueryClient();
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  
  // Create return states
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnItems, setReturnItems] = useState<Array<{ orderItemId: string; quantity: number; reason?: string }>>([]);
  
  // Barcode scanner states
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { data: returnsData, isLoading } = useQuery({
    queryKey: ['returns', page, search, statusFilter],
    queryFn: () => api.getReturns({ page, limit: 20, search, ...(statusFilter && { status: statusFilter }) }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-for-return'],
    queryFn: () => api.getOrders({ limit: 1000, status: 'DELIVERED' }),
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations', selectedWarehouse],
    queryFn: () => api.getLocations(selectedWarehouse),
    enabled: !!selectedWarehouse,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.approveReturn(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('İade onaylandı ve stoğa eklendi');
      setIsApproveModalOpen(false);
      setSelectedReturn(null);
      setSelectedWarehouse('');
      setSelectedLocation('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'İade onaylanamadı');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.rejectReturn(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success('İade reddedildi');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.completeReturn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success('İade tamamlandı');
    },
  });

  const createReturnMutation = useMutation({
    mutationFn: (data: any) => api.createReturn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success('İade oluşturuldu');
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'İade oluşturulamadı');
    },
  });

  const resetCreateForm = () => {
    setSelectedOrder(null);
    setReturnReason('');
    setReturnNote('');
    setReturnItems([]);
    setBarcodeInput('');
    stopCamera();
    setIsCameraMode(false);
  };

  // Camera functions
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    try {
      setCameraError(null);
      html5QrcodeRef.current = new Html5Qrcode("return-create-scanner", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
        ],
        verbose: false,
      });
      await html5QrcodeRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 300, height: 150 }, aspectRatio: 1.777778 },
        (decodedText) => handleBarcodeScanForReturn(decodedText),
        () => {}
      );
      setIsCameraActive(true);
    } catch (err: any) {
      setCameraError(err.message || 'Kamera başlatılamadı');
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrcodeRef.current) {
      try { await html5QrcodeRef.current.stop(); html5QrcodeRef.current.clear(); } catch (err) {}
      html5QrcodeRef.current = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraMode = async () => {
    if (isCameraMode) {
      await stopCamera();
      setIsCameraMode(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } else {
      setIsCameraMode(true);
      setTimeout(() => startCamera(), 100);
    }
  };

  const handleBarcodeScanForReturn = async (barcode: string) => {
    if (!barcode.trim() || !selectedOrder) return;
    const normalizedBarcode = barcode.trim();
    const orderItem = selectedOrder.items?.find((item: any) => {
      const itemBarcode = item.variant?.barcode?.trim() || item.product?.barcode?.trim() || item.variant?.sku?.trim() || item.product?.sku?.trim() || item.sku?.trim();
      return itemBarcode && (itemBarcode === normalizedBarcode || itemBarcode.toUpperCase() === normalizedBarcode.toUpperCase());
    });
    if (!orderItem) {
      toast.error(`Barkod siparişte bulunamadı: ${barcode}`);
      setBarcodeInput('');
      if (!isCameraMode) barcodeInputRef.current?.focus();
      return;
    }
    const existingItem = returnItems.find(item => item.orderItemId === orderItem.id);
    if (existingItem) {
      setReturnItems(returnItems.map(item => item.orderItemId === orderItem.id ? { ...item, quantity: item.quantity + 1 } : item));
      toast.success(`${orderItem.name} miktarı artırıldı`);
    } else {
      setReturnItems([...returnItems, { orderItemId: orderItem.id, quantity: 1 }]);
      toast.success(`${orderItem.name} eklendi`);
    }
    setBarcodeInput('');
    if (!isCameraMode) barcodeInputRef.current?.focus();
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleBarcodeScanForReturn(barcodeInput); }
  };

  useEffect(() => { return () => { stopCamera(); }; }, []);
  useEffect(() => {
    if (isCreateModalOpen && selectedOrder && !isCameraMode) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [isCreateModalOpen, selectedOrder, isCameraMode]);

  const handleCreateReturn = () => {
    if (!selectedOrder) { toast.error('Sipariş seçin'); return; }
    if (!returnReason.trim()) { toast.error('İade nedeni girin'); return; }
    if (returnItems.length === 0) { toast.error('En az bir ürün ekleyin'); return; }
    createReturnMutation.mutate({ orderId: selectedOrder.id, reason: returnReason, note: returnNote || undefined, items: returnItems });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: { variant: 'warning', label: 'Bekliyor' },
      APPROVED: { variant: 'success', label: 'Onaylandı' },
      REJECTED: { variant: 'danger', label: 'Reddedildi' },
      COMPLETED: { variant: 'primary', label: 'Tamamlandı' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const returns = returnsData?.data || [];
  const pagination = returnsData?.pagination;
  const warehouses = warehousesData?.data || [];
  const orders = ordersData?.data || [];
  const locations = locationsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-end">
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsCreateModalOpen(true)}>Yeni İade</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-warning-100 rounded-xl flex items-center justify-center"><Clock className="w-6 h-6 text-warning-600" /></div>
            <div><p className="text-2xl font-bold text-secondary-900">{returns.filter((r: any) => r.status === 'PENDING').length}</p><p className="text-sm text-secondary-500">Bekleyen</p></div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-success-100 rounded-xl flex items-center justify-center"><CheckCircle className="w-6 h-6 text-success-600" /></div>
            <div><p className="text-2xl font-bold text-secondary-900">{returns.filter((r: any) => r.status === 'APPROVED').length}</p><p className="text-sm text-secondary-500">Onaylanan</p></div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-danger-100 rounded-xl flex items-center justify-center"><XCircle className="w-6 h-6 text-danger-600" /></div>
            <div><p className="text-2xl font-bold text-secondary-900">{returns.filter((r: any) => r.status === 'REJECTED').length}</p><p className="text-sm text-secondary-500">Reddedilen</p></div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center"><Package className="w-6 h-6 text-primary-600" /></div>
            <div><p className="text-2xl font-bold text-secondary-900">{pagination?.total || 0}</p><p className="text-sm text-secondary-500">Toplam İade</p></div>
          </CardBody>
        </Card>
      </div>

      {/* Returns Table */}
      <Card>
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-secondary-900">İade Listesi</h2>
          <div className="flex items-center gap-3">
            <Input placeholder="Ara..." className="w-64" leftIcon={<Search className="w-4 h-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48" options={[
              { value: '', label: 'Tüm Durumlar' },
              { value: 'PENDING', label: 'Bekliyor' },
              { value: 'APPROVED', label: 'Onaylandı' },
              { value: 'REJECTED', label: 'Reddedildi' },
              { value: 'COMPLETED', label: 'Tamamlandı' },
            ]} />
          </div>
        </div>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : returns.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>İade No</TableHeader>
                  <TableHeader>Sipariş No</TableHeader>
                  <TableHeader>Neden</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader>İşlemler</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {returns.map((returnItem: any) => (
                  <TableRow key={returnItem.id}>
                    <TableCell className="font-medium">{returnItem.returnNumber}</TableCell>
                    <TableCell>{returnItem.order?.orderNumber || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{returnItem.reason}</TableCell>
                    <TableCell>{getStatusBadge(returnItem.status)}</TableCell>
                    <TableCell>{formatDateTime(returnItem.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedReturn(returnItem); setIsDetailModalOpen(true); }}><Eye className="w-4 h-4" /></Button>
                        {returnItem.status === 'PENDING' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedReturn(returnItem); setIsApproveModalOpen(true); }}><CheckCircle className="w-4 h-4 text-success-600" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => { if (confirm('İadeyi reddetmek istediğinize emin misiniz?')) rejectMutation.mutate({ id: returnItem.id }); }}><XCircle className="w-4 h-4 text-danger-600" /></Button>
                          </>
                        )}
                        {returnItem.status === 'APPROVED' && (
                          <Button variant="ghost" size="sm" onClick={() => completeMutation.mutate(returnItem.id)}><CheckCircle className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <RotateCcw className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">İade bulunamadı</h3>
              <p className="text-secondary-500 mb-4">Henüz iade kaydı oluşturulmamış</p>
              <Button onClick={() => setIsCreateModalOpen(true)}><Plus className="w-4 h-4 mr-2" />İlk İadeyi Oluştur</Button>
            </div>
          )}
        </CardBody>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-100">
            <p className="text-sm text-secondary-500">Toplam {pagination.total} iade</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Önceki</Button>
              <span className="text-sm text-secondary-600">Sayfa {page} / {pagination.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page === pagination.totalPages} onClick={() => setPage(page + 1)}>Sonraki</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Approve Modal */}
      <Modal isOpen={isApproveModalOpen} onClose={() => { setIsApproveModalOpen(false); setSelectedWarehouse(''); setSelectedLocation(''); }} title="İadeyi Onayla ve Stoğa Ekle">
        <div className="space-y-4">
          <div>
            <label className="label">Depo *</label>
            <select className="input" value={selectedWarehouse} onChange={(e) => { setSelectedWarehouse(e.target.value); setSelectedLocation(''); }}>
              <option value="">Depo seçin</option>
              {warehouses.map((warehouse: any) => (<option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>))}
            </select>
          </div>
          {selectedWarehouse && (
            <div>
              <label className="label">Lokasyon (Opsiyonel)</label>
              <select className="input" value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}>
                <option value="">Lokasyon seçin (opsiyonel)</option>
                {locations.map((location: any) => (<option key={location.id} value={location.id}>{location.code} {location.name ? `- ${location.name}` : ''}</option>))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setIsApproveModalOpen(false); setSelectedWarehouse(''); setSelectedLocation(''); }}>İptal</Button>
            <Button onClick={() => {
              if (!selectedWarehouse) { toast.error('Depo seçin'); return; }
              approveMutation.mutate({ id: selectedReturn.id, data: { warehouseId: selectedWarehouse, ...(selectedLocation && { locationId: selectedLocation }) } });
            }} isLoading={approveMutation.isPending}><CheckCircle className="w-4 h-4 mr-2" />Onayla ve Stoğa Ekle</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => { setIsDetailModalOpen(false); setSelectedReturn(null); }} title={`İade Detayı - ${selectedReturn?.returnNumber}`} size="lg">
        {selectedReturn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-secondary-500">İade No</p><p className="font-medium">{selectedReturn.returnNumber}</p></div>
              <div><p className="text-sm text-secondary-500">Sipariş No</p><p className="font-medium">{selectedReturn.order?.orderNumber || '-'}</p></div>
              <div><p className="text-sm text-secondary-500">Durum</p>{getStatusBadge(selectedReturn.status)}</div>
              <div><p className="text-sm text-secondary-500">Tarih</p><p className="font-medium">{formatDateTime(selectedReturn.createdAt)}</p></div>
            </div>
            <div><p className="text-sm text-secondary-500 mb-2">İade Nedeni</p><p className="font-medium">{selectedReturn.reason}</p></div>
            {selectedReturn.note && (<div><p className="text-sm text-secondary-500 mb-2">Not</p><p>{selectedReturn.note}</p></div>)}
            <div>
              <p className="text-sm text-secondary-500 mb-2">İade Kalemleri</p>
              <div className="space-y-2">
                {selectedReturn.items?.map((item: any) => (
                  <div key={item.id} className="p-3 bg-secondary-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div><p className="font-medium">{item.orderItem?.name || '-'}</p><p className="text-sm text-secondary-500">SKU: {item.orderItem?.sku || '-'}</p></div>
                      <div className="text-right"><p className="font-medium">{item.quantity} adet</p>{item.reason && (<p className="text-sm text-secondary-500">{item.reason}</p>)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Return Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); resetCreateForm(); }} title="Yeni İade Oluştur" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Sipariş *</label>
            <select className="input" value={selectedOrder?.id || ''} onChange={(e) => { const order = orders.find((o: any) => o.id === e.target.value); setSelectedOrder(order || null); setReturnItems([]); }}>
              <option value="">Sipariş seçin</option>
              {orders.map((order: any) => (<option key={order.id} value={order.id}>#{order.orderNumber} - {order.customerName} ({formatDateTime(order.createdAt)})</option>))}
            </select>
          </div>
          {selectedOrder && (
            <div className="space-y-2 p-4 bg-secondary-50 rounded-xl">
              <p className="text-sm font-medium text-secondary-700 mb-2">Barkod Okutarak Ürün Ekle</p>
              <div className="flex gap-2 mb-2">
                <Button variant={!isCameraMode ? 'primary' : 'secondary'} onClick={() => isCameraMode && toggleCameraMode()} className="flex-1" size="sm"><Keyboard className="w-4 h-4 mr-2" />Manuel</Button>
                <Button variant={isCameraMode ? 'primary' : 'secondary'} onClick={() => !isCameraMode && toggleCameraMode()} className="flex-1" size="sm"><Camera className="w-4 h-4 mr-2" />Kamera</Button>
              </div>
              {isCameraMode ? (
                <div className="space-y-2">
                  <div id="return-create-scanner" ref={scannerContainerRef} className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: '200px' }} />
                  {cameraError && <div className="p-3 bg-danger-50 rounded-xl text-danger-700 text-sm">{cameraError}</div>}
                  {!isCameraActive && !cameraError && <Button onClick={startCamera} className="w-full" size="sm"><Camera className="w-4 h-4 mr-2" />Kamerayı Başlat</Button>}
                </div>
              ) : (
                <Input ref={barcodeInputRef} value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyPress={handleBarcodeKeyPress} placeholder="Barkod okutun..." leftIcon={<ScanLine className="w-5 h-5" />} />
              )}
            </div>
          )}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <label className="label">İade Kalemleri</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {returnItems.map((item, index) => {
                  const orderItem = selectedOrder?.items?.find((oi: any) => oi.id === item.orderItemId);
                  return (
                    <div key={index} className="p-3 bg-secondary-50 rounded-lg flex items-center justify-between">
                      <div><p className="font-medium">{orderItem?.name || '-'}</p><p className="text-sm text-secondary-500">Miktar: {item.quantity}</p></div>
                      <Button variant="ghost" size="sm" onClick={() => setReturnItems(returnItems.filter((_, i) => i !== index))}><X className="w-4 h-4" /></Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div><label className="label">İade Nedeni *</label><textarea className="input min-h-[80px]" placeholder="İade nedeni..." value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /></div>
          <div><label className="label">Not (Opsiyonel)</label><textarea className="input min-h-[60px]" placeholder="Ek notlar..." value={returnNote} onChange={(e) => setReturnNote(e.target.value)} /></div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setIsCreateModalOpen(false); resetCreateForm(); }}>İptal</Button>
            <Button onClick={handleCreateReturn} isLoading={createReturnMutation.isPending} disabled={!selectedOrder || !returnReason.trim() || returnItems.length === 0}><Plus className="w-4 h-4 mr-2" />İade Oluştur</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function Orders() {
  const [activeTab, setActiveTab] = useState<'orders' | 'returns'>('orders');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Siparişler</h1>
          <p className="text-secondary-500">Siparişlerinizi ve iadeleri yönetin</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('orders')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'orders'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <ShoppingCart className="w-4 h-4" />
            Siparişler
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'returns'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <RotateCcw className="w-4 h-4" />
            İadeler
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'orders' ? <OrdersTab /> : <ReturnsTab />}
    </div>
  );
}

