import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ScanLine,
  Package,
  CheckCircle,
  ShoppingCart,
  Truck,
  Camera,
  Keyboard,
  Play,
  Eye,
  User,
  List,
  Box,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Badge,
  Card,
  CardBody,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui';
import { cn } from '@/utils';
import api from '@/services/api';
import { ROUTES } from '@/constants/routes';

export default function WaveDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'aggregate' | 'orders' | 'packing'>('aggregate');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScanStatus, setLastScanStatus] = useState<'success' | 'error' | 'warning' | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { data: waveData, isLoading } = useQuery({
    queryKey: ['picking-wave', id],
    queryFn: () => api.getPickingWave(id!),
    enabled: !!id,
  });

  const { data: aggregatedData, refetch: refetchAggregated } = useQuery({
    queryKey: ['picking-wave-aggregate', id],
    queryFn: () => api.aggregatePickingWaveItems(id!),
    enabled: !!id,
  });

  const wave = waveData?.data;
  const aggregated = aggregatedData?.data;

  // Mutations
  const startMutation = useMutation({
    mutationFn: (waveId: string) => api.startPickingWave(waveId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['picking-wave', id] });
      await refetchAggregated();
      toast.success('Toplama başlatıldı');
    },
  });

  const completePickingMutation = useMutation({
    mutationFn: (waveId: string) => api.completePicking(waveId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['picking-wave', id] });
      await refetchAggregated();
      toast.success('Toplama tamamlandı, paketleme aşamasına geçildi');
    },
  });

  const markOrderAsPackedMutation = useMutation({
    mutationFn: ({ waveId, orderId }: { waveId: string; orderId: string }) =>
      api.markOrderAsPacked(waveId, orderId),
    onSuccess: async () => {
      // Wave ve aggregated data'yı yenile
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      queryClient.invalidateQueries({ queryKey: ['picking-wave', id] });
      queryClient.invalidateQueries({ queryKey: ['picking-wave-aggregate', id] });
      await Promise.all([refetchAggregated()]);
      toast.success('Sipariş paketlendi');
    },
  });

  const markOrderAsShippedMutation = useMutation({
    mutationFn: ({ waveId, orderId, data }: { waveId: string; orderId: string; data?: { trackingNumber?: string; cargoCompanyId?: string } }) =>
      api.markOrderAsShipped(waveId, orderId, data),
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      queryClient.invalidateQueries({ queryKey: ['picking-wave', id] });
      await refetchAggregated();
      if (result.data?.allShipped) {
        toast.success('Tüm siparişler gönderildi, dalga kapatıldı');
      } else {
        toast.success('Sipariş gönderildi');
      }
    },
  });

  const scanBarcodeMutation = useMutation({
    mutationFn: ({ waveId, barcode }: { waveId: string; barcode: string }) =>
      api.scanPickingWaveBarcode(waveId, barcode),
    onSuccess: async (data) => {
      toast.success(data.message || 'Barkod okutuldu');
      setBarcodeInput('');
      setLastScanStatus('success');
      await refetchAggregated();
      setTimeout(() => setLastScanStatus(null), 1500);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Barkod okutulamadı');
      setLastScanStatus('error');
      setTimeout(() => setLastScanStatus(null), 1500);
    },
  });

  const handleScanBarcode = (barcode: string) => {
    if (!barcode.trim() || !id) return;
    scanBarcodeMutation.mutate({ waveId: id, barcode: barcode.trim() });
  };

  // Camera functions
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    
    try {
      const html5QrCode = new Html5Qrcode('picking-wave-scanner');
      html5QrcodeRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanBarcode(decodedText);
        },
        () => {}
      );
      
      setIsCameraActive(true);
      setCameraError(null);
    } catch (error: any) {
      setCameraError(error.message || 'Kamera başlatılamadı');
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrcodeRef.current) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (error) {
        // Ignore stop errors
      }
      html5QrcodeRef.current = null;
      setIsCameraActive(false);
    }
  };

  const toggleCameraMode = () => {
    if (isCameraMode) {
      stopCamera();
      setIsCameraMode(false);
    } else {
      setIsCameraMode(true);
      setTimeout(() => {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
      }, 100);
    }
  };

  useEffect(() => {
    return () => {
      if (isCameraActive) {
        stopCamera();
      }
    };
  }, [isCameraActive]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' }> = {
      CREATED: { label: 'Oluşturuldu', variant: 'secondary' },
      PENDING: { label: 'Beklemede', variant: 'secondary' },
      PICKING: { label: 'Toplanıyor', variant: 'primary' },
      IN_PROGRESS: { label: 'Devam Ediyor', variant: 'primary' },
      PACKING: { label: 'Paketleniyor', variant: 'primary' },
      SHIPPED: { label: 'Gönderildi', variant: 'success' },
      CLOSED: { label: 'Kapatıldı', variant: 'success' },
      COMPLETED: { label: 'Tamamlandı', variant: 'success' },
      CANCELLED: { label: 'İptal Edildi', variant: 'danger' },
      EXCEPTION: { label: 'Hata', variant: 'danger' },
    };
    const statusInfo = statusMap[status] || { label: status, variant: 'secondary' };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const getWaveTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      TIME_BASED: 'Zaman Bazlı',
      SKU_BASED: 'SKU Bazlı',
      PRIORITY: 'Öncelikli',
      MANUAL: 'Manuel',
      MARKETPLACE: 'Marketplace',
      SHIPPING: 'Kargo',
      COUNTRY: 'Ülke',
      MIXED: 'Karma',
    };
    return typeMap[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-secondary-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!wave) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-danger-600 mb-4">Dalga bulunamadı</p>
          <Button onClick={() => navigate(ROUTES.ORDER_PICKING)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri Dön
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <div className="bg-white border-b border-secondary-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(ROUTES.ORDER_PICKING)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Geri Dön
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">{wave.code} - Detay</h1>
                <p className="text-sm text-secondary-500">Sipariş Hazırlama Süreci</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-secondary-200 mb-6">
          <Button variant={viewMode === 'aggregate' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('aggregate')}>
            <List className="w-4 h-4 mr-2" />Toplu Liste
          </Button>
          <Button variant={viewMode === 'orders' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('orders')}>
            <ShoppingCart className="w-4 h-4 mr-2" />Sipariş Sepetleri
          </Button>
          <Button variant={viewMode === 'packing' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('packing')}>
            <Box className="w-4 h-4 mr-2" />Paketleme
          </Button>
        </div>

        {/* Wave Summary */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-white rounded-lg shadow-sm mb-6">
          <div><p className="text-sm text-secondary-500">Durum</p><div className="mt-1">{getStatusBadge(wave.status)}</div></div>
          <div><p className="text-sm text-secondary-500">Tip</p><p className="font-medium mt-1">{getWaveTypeLabel(wave.type || '')}</p></div>
          <div><p className="text-sm text-secondary-500">Toplam Sipariş</p><p className="font-medium mt-1">{(wave as any)._count?.orders || (wave as any).totalOrders || 0}</p></div>
          <div><p className="text-sm text-secondary-500">Depo</p><p className="font-medium mt-1">{(wave as any).warehouse?.name || '-'}</p></div>
        </div>

        {/* Status Transition Buttons */}
        <div className="flex gap-2 flex-wrap mb-6">
          {wave.status === 'CREATED' && (
            <Button
              size="sm"
              onClick={() => startMutation.mutate(wave.id)}
              isLoading={startMutation.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              Toplamaya Başla
            </Button>
          )}
          {wave.status === 'PICKING' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => completePickingMutation.mutate(wave.id)}
              isLoading={completePickingMutation.isPending}
            >
              <Package className="w-4 h-4 mr-2" />
              Paketlemeye Geç
            </Button>
          )}
          {(wave.status === 'PICKING' || wave.status === 'PACKING') && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await api.getPickList(wave.id, 'mobile');
                  toast.success('Pick list hazır');
                } catch (error: any) {
                  toast.error(error.response?.data?.message || 'Pick list oluşturulamadı');
                }
              }}
            >
              <Eye className="w-4 h-4 mr-2" />
              Pick List Görüntüle
            </Button>
          )}
        </div>

        {/* Content Views */}
        {viewMode === 'aggregate' && aggregated && (
          <div className="space-y-4">
            <h3 className="font-medium text-secondary-900">Toplu Ürün Listesi</h3>
            {(wave.status === 'PICKING' || wave.status === 'IN_PROGRESS') && (
              <Card className={cn('border-2 transition-colors', lastScanStatus === 'success' && 'border-success-500 bg-success-50', lastScanStatus === 'error' && 'border-danger-500 bg-danger-50')}>
                <CardBody className="p-4">
                  <div className="flex gap-2 mb-4">
                    <Button variant={!isCameraMode ? 'primary' : 'secondary'} onClick={() => isCameraMode && toggleCameraMode()} className="flex-1" size="sm">
                      <Keyboard className="w-4 h-4 mr-2" />Manuel
                    </Button>
                    <Button variant={isCameraMode ? 'primary' : 'secondary'} onClick={() => !isCameraMode && toggleCameraMode()} className="flex-1" size="sm">
                      <Camera className="w-4 h-4 mr-2" />Kamera
                    </Button>
                  </div>
                  {isCameraMode ? (
                    <div className="space-y-4">
                      <div id="picking-wave-scanner" ref={scannerContainerRef} className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: '200px' }} />
                      {cameraError && <p className="text-sm text-danger-600">{cameraError}</p>}
                      {!isCameraActive && !cameraError && <Button onClick={startCamera} className="w-full"><Camera className="w-4 h-4 mr-2" />Kamerayı Başlat</Button>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input ref={barcodeInputRef} type="text" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleScanBarcode(barcodeInput)} placeholder="Barkod okutun..." className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" autoFocus />
                      <Button onClick={() => handleScanBarcode(barcodeInput)} disabled={!barcodeInput.trim()} isLoading={scanBarcodeMutation.isPending} className="w-full"><ScanLine className="w-4 h-4 mr-2" />Okut</Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
            <Card>
              <CardBody className="p-0">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Ürün</TableHeader>
                      <TableHeader>SKU</TableHeader>
                      <TableHeader>Miktar</TableHeader>
                      <TableHeader>Durum</TableHeader>
                      <TableHeader>Sipariş Sayısı</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {((aggregated as any).aggregatedItems || aggregated.items || [])?.map((item: any, index: number) => {
                      const pickedQty = item.pickedQuantity || 0;
                      const totalQty = item.totalQuantity || 0;
                      const isComplete = pickedQty >= totalQty;
                      return (
                        <TableRow key={index}>
                          <TableCell><p className="font-medium">{item.productName}</p></TableCell>
                          <TableCell><code className="text-sm bg-secondary-100 px-2 py-1 rounded">{item.productSku}</code></TableCell>
                          <TableCell><Badge variant="primary">{totalQty} adet</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{pickedQty} / {totalQty}</span>
                              {isComplete && <Badge variant="success" className="text-xs">Tamamlandı</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{item.orders?.length || 0} sipariş</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          </div>
        )}

        {viewMode === 'orders' && aggregated && (
          <div className="space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto">
            {(aggregated.orders || [])?.map((order: any) => {
              const orderStatus = order.status || 'READY_TO_PICK';
              const isPicked = orderStatus === 'PICKED' || orderStatus === 'PACKED' || orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED';
              const isPacked = orderStatus === 'PACKED' || orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED';
              const isShipped = orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED';
              
              return (
                <Card key={order.id} className={cn(
                  isShipped && 'border-success-200 bg-success-50/30',
                  isPacked && !isShipped && 'border-primary-200 bg-primary-50/30'
                )}>
                  <CardBody>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-secondary-400" />
                        <div>
                          <p className="font-medium">{order.customerName}</p>
                          <p className="text-sm text-secondary-500">{order.orderNumber}</p>
                        </div>
                      </div>
                      <Badge variant={
                        isShipped ? 'success' :
                        isPacked ? 'primary' :
                        isPicked ? 'secondary' :
                        'secondary'
                      }>
                        {isShipped ? 'Gönderildi' :
                         isPacked ? 'Paketlendi' :
                         isPicked ? 'Toplandı' :
                         'Hazırlanıyor'}
                      </Badge>
                    </div>
                    <div className="space-y-2 mb-3">
                      {(() => {
                        // Aynı ürünleri birleştir (SKU'ya göre)
                        const groupedItems = new Map<string, { productName: string; sku: string; totalQuantity: number }>();
                        order.items?.forEach((item: any) => {
                          const sku = (item.productSku || item.sku || '').trim().toUpperCase();
                          const key = sku || `${item.productId}-${item.variantId || 'no-variant'}`;
                          if (groupedItems.has(key)) {
                            const existing = groupedItems.get(key)!;
                            existing.totalQuantity += item.quantity || 0;
                          } else {
                            groupedItems.set(key, {
                              productName: item.productName || item.name || 'Bilinmeyen Ürün',
                              sku: sku || item.productSku || item.sku || '',
                              totalQuantity: item.quantity || 0,
                            });
                          }
                        });
                        return Array.from(groupedItems.values()).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-secondary-50 rounded">
                            <span className="text-sm font-medium">{item.productName}</span>
                            <Badge variant="secondary">{item.totalQuantity} adet</Badge>
                          </div>
                        ));
                      })()}
                    </div>
                    {/* Sipariş bazlı aksiyonlar */}
                    <div className="flex gap-2">
                      {isPicked && !isPacked && wave.status === 'PACKING' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => markOrderAsPackedMutation.mutate({ 
                            waveId: wave.id, 
                            orderId: order.id 
                          })}
                          isLoading={markOrderAsPackedMutation.isPending}
                          className="flex-1"
                        >
                          <Package className="w-4 h-4 mr-2" />
                          Paketle
                        </Button>
                      )}
                      {isPacked && !isShipped && (wave.status === 'PACKING' || wave.status === 'SHIPPED') && (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => {
                            const trackingNumber = prompt('Takip numarası (opsiyonel):');
                            markOrderAsShippedMutation.mutate({ 
                              waveId: wave.id, 
                              orderId: order.id,
                              data: { trackingNumber: trackingNumber || undefined }
                            });
                          }}
                          isLoading={markOrderAsShippedMutation.isPending}
                          className="flex-1"
                        >
                          <Truck className="w-4 h-4 mr-2" />
                          Gönder
                        </Button>
                      )}
                      {isShipped && (
                        <Badge variant="success" className="w-full justify-center py-2">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Gönderildi
                        </Badge>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {viewMode === 'packing' && aggregated && (
          <div className="space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto">
            {(aggregated.orders || [])?.map((order: any) => {
              const orderStatus = order.status || 'READY_TO_PICK';
              const isPacked = orderStatus === 'PACKED' || orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED';
              const isShipped = orderStatus === 'SHIPPED' || orderStatus === 'DELIVERED';
              
              return (
                <Card key={order.id} className={cn(
                  isShipped && 'border-success-200 bg-success-50/30',
                  isPacked && !isShipped && 'border-primary-200 bg-primary-50/30'
                )}>
                  <CardBody>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium">{order.customerName}</p>
                        <p className="text-sm text-secondary-500">{order.orderNumber}</p>
                      </div>
                      <Badge variant={
                        isShipped ? 'success' :
                        isPacked ? 'primary' :
                        'secondary'
                      }>
                        {isShipped ? 'Gönderildi' :
                         isPacked ? 'Paketlendi' :
                         'Paketleniyor'}
                      </Badge>
                    </div>
                    <div className="space-y-2 mb-3">
                      {(() => {
                        // Aynı ürünleri birleştir (SKU'ya göre)
                        const groupedItems = new Map<string, { productName: string; sku: string; totalQuantity: number }>();
                        order.items?.forEach((item: any) => {
                          const sku = (item.productSku || item.sku || '').trim().toUpperCase();
                          const key = sku || `${item.productId}-${item.variantId || 'no-variant'}`;
                          if (groupedItems.has(key)) {
                            const existing = groupedItems.get(key)!;
                            existing.totalQuantity += item.quantity || 0;
                          } else {
                            groupedItems.set(key, {
                              productName: item.productName || item.name || 'Bilinmeyen Ürün',
                              sku: sku || item.productSku || item.sku || '',
                              totalQuantity: item.quantity || 0,
                            });
                          }
                        });
                        return Array.from(groupedItems.values()).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-secondary-50 rounded">
                            <span className="text-sm font-medium">{item.productName}</span>
                            <Badge variant="secondary">{item.totalQuantity} adet</Badge>
                          </div>
                        ));
                      })()}
                    </div>
                    {/* Paketleme aşaması için gönderme butonu */}
                    {isPacked && !isShipped && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          const trackingNumber = prompt('Takip numarası (opsiyonel):');
                          markOrderAsShippedMutation.mutate({ 
                            waveId: wave.id, 
                            orderId: order.id,
                            data: { trackingNumber: trackingNumber || undefined }
                          });
                        }}
                        isLoading={markOrderAsShippedMutation.isPending}
                        className="w-full"
                      >
                        <Truck className="w-4 h-4 mr-2" />
                        Gönder
                      </Button>
                    )}
                    {isShipped && (
                      <Badge variant="success" className="w-full justify-center py-2">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Gönderildi
                      </Badge>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

