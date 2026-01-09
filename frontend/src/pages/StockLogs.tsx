import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  RefreshCw,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  Settings,
  ArrowLeftRight,
  Plus,
  ScanLine,
  Camera,
  Keyboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Input,
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
  Modal,
} from '@/components/ui';
import {
  formatDateTime,
  getStockLogTypeLabel,
  getStockLogTypeColor,
} from '@/utils';
import api from '@/services/api';
import type { StockLog, StockLogType } from '@/utils/types';

export default function StockLogs() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [adjustType, setAdjustType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Barcode scanner states
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['stockLogs', page, search, typeFilter],
    queryFn: () => api.getStockLogs({
      page,
      limit: 20,
      ...(typeFilter && { type: typeFilter }),
    }),
  });

  const getTypeIcon = (type: StockLogType) => {
    switch (type) {
      case 'IN': return ArrowUpCircle;
      case 'OUT': return ArrowDownCircle;
      case 'RETURN': return RotateCcw;
      case 'ADJUSTMENT': return Settings;
      case 'TRANSFER': return ArrowLeftRight;
      default: return RefreshCw;
    }
  };

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

  const handleSyncStocks = async () => {
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
      queryClient.invalidateQueries({ queryKey: ['stockLogs'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stoklar senkronize edildi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Senkronizasyon başarısız');
    } finally {
      setIsSyncing(false);
    }
  };

  const adjustStockMutation = useMutation({
    mutationFn: (data: any) => api.adjustStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockLogs'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Stok düzenlendi');
      setIsAdjustModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Stok düzenlenemedi');
    },
  });

  const resetForm = () => {
    setSelectedProduct(null);
    setSelectedWarehouse('');
    setAdjustType('ADJUSTMENT');
    setQuantity('');
    setNote('');
    setBarcodeInput('');
  };

  // Start camera scanner
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    
    try {
      setCameraError(null);
      html5QrcodeRef.current = new Html5Qrcode("stock-adjust-scanner", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
        verbose: false,
      });

      await html5QrcodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 300, height: 150 },
          aspectRatio: 1.777778,
        },
        (decodedText) => {
          handleBarcodeScan(decodedText);
        },
        () => {}
      );
      
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.message || 'Kamera başlatılamadı');
      setIsCameraActive(false);
    }
  };

  // Stop camera scanner
  const stopCamera = async () => {
    if (html5QrcodeRef.current) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping camera:', err);
      }
      html5QrcodeRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Toggle camera mode
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

  // Handle barcode scan
  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode.trim()) return;

    const normalizedBarcode = barcode.trim();
    
    try {
      // ✅ GÜNCELLEME: Barcode, GTIN veya SKU ile ara
      let product;
      try {
        const response = await api.getProductByBarcode(normalizedBarcode);
        product = response.data;
      } catch (error) {
        // ✅ GÜNCELLEME: Hata mesajını güncelle - SKU da kabul ediliyor
        toast.error(`Ürün bulunamadı: ${normalizedBarcode}. Barkod, GTIN veya SKU okutun.`);
        setBarcodeInput('');
        if (!isCameraMode) {
          barcodeInputRef.current?.focus();
        }
        return;
      }

      if (!product) {
        toast.error(`Ürün bulunamadı: ${normalizedBarcode}`);
        setBarcodeInput('');
        if (!isCameraMode) {
          barcodeInputRef.current?.focus();
        }
        return;
      }

      setSelectedProduct(product);
      toast.success(`${product.name} seçildi`);
      setBarcodeInput('');
      
      if (!isCameraMode) {
        barcodeInputRef.current?.focus();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Bir hata oluştu');
    }
  };

  // Handle Enter key in barcode input
  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeScan(barcodeInput);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Focus barcode input when modal opens
  useEffect(() => {
    if (isAdjustModalOpen && !isCameraMode) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isAdjustModalOpen, isCameraMode]);

  const handleSubmitAdjust = () => {
    if (!selectedProduct) {
      toast.error('Ürün seçin');
      return;
    }
    if (!selectedWarehouse) {
      toast.error('Depo seçin');
      return;
    }
    if (!quantity || parseInt(quantity) <= 0) {
      toast.error('Geçerli bir miktar girin');
      return;
    }

    adjustStockMutation.mutate({
      productId: selectedProduct.id,
      warehouseId: selectedWarehouse,
      quantity: parseInt(quantity),
      type: adjustType,
      note: note || undefined,
    });
  };

  const logs = logsData?.data || [];
  const pagination = logsData?.pagination;
  const warehouses = warehousesData?.data || [];

  const typeOptions = [
    { value: '', label: 'Tüm Hareketler' },
    { value: 'IN', label: 'Giriş' },
    { value: 'OUT', label: 'Çıkış' },
    { value: 'RETURN', label: 'İade' },
    { value: 'ADJUSTMENT', label: 'Düzeltme' },
    { value: 'TRANSFER', label: 'Transfer' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Stok Hareketleri</h1>
          <p className="text-secondary-500">Tüm stok giriş-çıkışlarını takip edin</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleSyncStocks}
            isLoading={isSyncing}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Senkronize Et
          </Button>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAdjustModalOpen(true)}
          >
            Stok Düzenle
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Ürün adı, SKU ara..."
                leftIcon={<Search className="w-5 h-5" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              options={typeOptions}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-48"
            />
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : logs.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader>Tür</TableHeader>
                  <TableHeader>Ürün</TableHeader>
                  <TableHeader>Depo</TableHeader>
                  <TableHeader>Miktar</TableHeader>
                  <TableHeader>Önceki → Yeni</TableHeader>
                  <TableHeader>Not</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log: StockLog) => {
                  const TypeIcon = getTypeIcon(log.type);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-secondary-500">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStockLogTypeColor(log.type) as any}>
                          <TypeIcon className="w-3 h-3 mr-1" />
                          {getStockLogTypeLabel(log.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-secondary-900">
                            {log.product.name}
                          </p>
                          <p className="text-sm text-secondary-500">
                            {log.product.sku}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-secondary-100 px-2 py-0.5 rounded">
                          {log.warehouse.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          log.type === 'IN' || log.type === 'RETURN'
                            ? 'text-success-600'
                            : log.type === 'OUT'
                            ? 'text-danger-600'
                            : 'text-secondary-900'
                        }`}>
                          {log.type === 'IN' || log.type === 'RETURN' ? '+' : 
                           log.type === 'OUT' ? '-' : ''}
                          {log.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-secondary-500">{log.previousQty}</span>
                        <span className="mx-2">→</span>
                        <span className="font-medium text-secondary-900">{log.newQty}</span>
                      </TableCell>
                      <TableCell className="text-sm text-secondary-500 max-w-xs truncate">
                        {log.note || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <RefreshCw className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Stok hareketi bulunamadı
              </h3>
              <p className="text-secondary-500">
                Henüz stok hareketi yok
              </p>
            </div>
          )}
        </CardBody>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-100">
            <p className="text-sm text-secondary-500">
              Toplam {pagination.total} hareket
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

      {/* Stock Adjust Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => {
          setIsAdjustModalOpen(false);
          stopCamera();
          setIsCameraMode(false);
          resetForm();
        }}
        title="Stok Düzenle"
        size="lg"
      >
        <div className="space-y-4">
          {/* Barcode Scanner */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant={!isCameraMode ? 'primary' : 'secondary'}
                onClick={() => {
                  if (isCameraMode) toggleCameraMode();
                }}
                className="flex-1"
              >
                <Keyboard className="w-4 h-4 mr-2" />
                Manuel / Okuyucu
              </Button>
              <Button
                variant={isCameraMode ? 'primary' : 'secondary'}
                onClick={() => {
                  if (!isCameraMode) toggleCameraMode();
                }}
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                Kamera ile Oku
              </Button>
            </div>

            {isCameraMode ? (
              <div className="space-y-2">
                <div 
                  id="stock-adjust-scanner" 
                  ref={scannerContainerRef}
                  className="w-full rounded-xl overflow-hidden bg-black"
                  style={{ minHeight: '200px' }}
                />
                {cameraError && (
                  <div className="p-3 bg-danger-50 rounded-xl text-danger-700 text-sm">
                    {cameraError}
                  </div>
                )}
                {!isCameraActive && !cameraError && (
                  <Button onClick={startCamera} className="w-full">
                    <Camera className="w-4 h-4 mr-2" />
                    Kamerayı Başlat
                  </Button>
                )}
              </div>
            ) : (
              <Input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyPress={handleBarcodeKeyPress}
                placeholder="Barkod veya SKU okutun/yazın..."
                leftIcon={<ScanLine className="w-5 h-5" />}
              />
            )}
          </div>

          {/* Selected Product */}
          {selectedProduct && (
            <div className="p-4 bg-primary-50 rounded-xl">
              <p className="text-sm text-primary-700 mb-1">Seçili Ürün</p>
              <p className="font-semibold text-primary-900">{selectedProduct.name}</p>
              <p className="text-sm text-primary-600">SKU: {selectedProduct.sku}</p>
            </div>
          )}

          {/* Warehouse Selection */}
          <div>
            <label className="label">Depo *</label>
            <select
              className="input"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
            >
              <option value="">Depo seçin</option>
              {warehouses.map((warehouse: any) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </div>

          {/* Adjustment Type */}
          <div>
            <label className="label">İşlem Türü *</label>
            <select
              className="input"
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as any)}
            >
              <option value="ADJUSTMENT">Düzeltme (Manuel)</option>
              <option value="IN">Giriş</option>
              <option value="OUT">Çıkış</option>
            </select>
          </div>

          {/* Quantity */}
          <Input
            label="Miktar *"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />

          {/* Note */}
          <div>
            <label className="label">Not (Opsiyonel)</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Stok düzenleme notu..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsAdjustModalOpen(false);
                stopCamera();
                setIsCameraMode(false);
                resetForm();
              }}
            >
              İptal
            </Button>
            <Button
              onClick={handleSubmitAdjust}
              isLoading={adjustStockMutation.isPending}
              disabled={!selectedProduct || !selectedWarehouse || !quantity}
            >
              <Settings className="w-4 h-4 mr-2" />
              Stok Düzenle
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

