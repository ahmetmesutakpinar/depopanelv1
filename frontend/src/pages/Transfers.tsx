import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  ArrowLeftRight,
  Plus,
  Search,
  Package,
  Warehouse,
  ArrowRight,
  Calendar,
  User,
  FileText,
  CheckCircle,
  Truck,
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
} from '@/components/ui';
import { formatDateTime, formatNumber } from '@/utils';
import api from '@/services/api';

const transferSchema = z.object({
  productId: z.string().min(1, 'Ürün seçin'),
  fromWarehouseId: z.string().min(1, 'Kaynak depo seçin'),
  toWarehouseId: z.string().min(1, 'Hedef depo seçin'),
  quantity: z.coerce.number().int().positive('Miktar pozitif olmalı'),
  note: z.string().optional(),
}).refine(data => data.fromWarehouseId !== data.toWarehouseId, {
  message: 'Kaynak ve hedef depo aynı olamaz',
  path: ['toWarehouseId'],
});

type TransferForm = z.infer<typeof transferSchema>;

export default function Transfers() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  // Barcode scanner states
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Fetch stock logs with TRANSFER type
  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['transfers', page, search],
    queryFn: () => api.getStockLogs({ type: 'TRANSFER', page, limit: 20 }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-for-transfer'],
    queryFn: () => api.getProducts({ limit: 1000, isActive: true }),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
  });

  const watchFromWarehouse = watch('fromWarehouseId');

  // Start camera scanner
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    
    try {
      setCameraError(null);
      
      html5QrcodeRef.current = new Html5Qrcode("transfer-barcode-scanner", {
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
        () => {
          // Scanning failed (ignore)
        }
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

      // Set product in form
      setValue('productId', product.id);
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
    if (isModalOpen && !isCameraMode) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isModalOpen, isCameraMode]);

  const transferMutation = useMutation({
    mutationFn: (data: any) => api.transferStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      toast.success('Sevkiyat başarılı!');
      setIsModalOpen(false);
      reset();
      setSelectedProduct(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Sevkiyat başarısız');
    },
  });

  const onSubmit = (data: TransferForm) => {
    transferMutation.mutate({
      productId: data.productId,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      quantity: data.quantity,
      note: data.note || `Depolar arası sevkiyat`,
    });
  };

  // Get stock for selected product and warehouse
  const getAvailableStock = () => {
    if (!selectedProduct || !watchFromWarehouse) return 0;
    const stock = selectedProduct.stocks?.find((s: any) => s.warehouse.id === watchFromWarehouse);
    return stock ? stock.quantity - stock.reservedQty : 0;
  };

  const transfers = transfersData?.data || [];
  const pagination = transfersData?.pagination;
  const warehouses = warehousesData?.data || [];
  const products = productsData?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Depolar Arası Sevkiyat</h1>
          <p className="text-secondary-500">Depolar arasında stok transferi yapın ve hareketleri takip edin</p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            reset();
            setSelectedProduct(null);
            setIsModalOpen(true);
          }}
        >
          Yeni Sevkiyat
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {pagination?.total || 0}
              </p>
              <p className="text-sm text-secondary-500">Toplam Sevkiyat</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-success-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {warehouses.length}
              </p>
              <p className="text-sm text-secondary-500">Aktif Depo</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-warning-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {products.length}
              </p>
              <p className="text-sm text-secondary-500">Aktif Ürün</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Transfers Table */}
      <Card>
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-secondary-900">Sevkiyat Hareketleri</h2>
          <Input
            placeholder="Ara..."
            className="w-64"
            leftIcon={<Search className="w-4 h-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : transfers.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader>Ürün</TableHeader>
                  <TableHeader>Depo Hareketi</TableHeader>
                  <TableHeader>Miktar</TableHeader>
                  <TableHeader>Kullanıcı</TableHeader>
                  <TableHeader>Not</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {transfers.map((transfer: any) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-secondary-400" />
                        {formatDateTime(transfer.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-secondary-400" />
                        </div>
                        <div>
                          <p className="font-medium text-secondary-900">
                            {transfer.product?.name}
                          </p>
                          <p className="text-sm text-secondary-500">
                            {transfer.product?.sku}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          <Warehouse className="w-3 h-3 mr-1" />
                          {transfer.warehouse?.code}
                        </Badge>
                        <ArrowRight className="w-4 h-4 text-secondary-400" />
                        <Badge variant="primary">
                          <Truck className="w-3 h-3 mr-1" />
                          {transfer.note?.includes('Transfer:') 
                            ? transfer.note.split('Transfer:')[1]?.trim() 
                            : '-'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-danger-600">
                        -{formatNumber(transfer.quantity)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {transfer.user ? (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-secondary-400" />
                          {transfer.user.firstName} {transfer.user.lastName}
                        </div>
                      ) : (
                        <span className="text-secondary-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-secondary-500 max-w-xs truncate">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-secondary-400" />
                        {transfer.note || '-'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <ArrowLeftRight className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Sevkiyat bulunamadı
              </h3>
              <p className="text-secondary-500 mb-4">
                Henüz depolar arası sevkiyat yapılmamış
              </p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Sevkiyatı Oluştur
              </Button>
            </div>
          )}
        </CardBody>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-100">
            <p className="text-sm text-secondary-500">
              Toplam {pagination.total} sevkiyat
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

      {/* Transfer Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProduct(null);
          stopCamera();
          setIsCameraMode(false);
          setBarcodeInput('');
        }}
        title="Yeni Sevkiyat"
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Barcode Scanner */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label flex items-center gap-2">
                <ScanLine className="w-4 h-4" />
                Barkod / SKU ile Ürün Seç
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleCameraMode}
              >
                {isCameraMode ? (
                  <>
                    <Keyboard className="w-4 h-4 mr-2" />
                    Klavye
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Kamera
                  </>
                )}
              </Button>
            </div>
            
            {isCameraMode ? (
              <div className="space-y-2">
                <div
                  ref={scannerContainerRef}
                  id="transfer-barcode-scanner"
                  className="w-full h-64 bg-secondary-100 rounded-lg overflow-hidden relative"
                />
                {cameraError && (
                  <p className="text-sm text-danger-600">{cameraError}</p>
                )}
                {!isCameraActive && !cameraError && (
                  <div className="flex items-center justify-center h-64 bg-secondary-100 rounded-lg">
                    <p className="text-secondary-500">Kamera başlatılıyor...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={barcodeInputRef}
                  placeholder="Barkod veya SKU okutun/yazın..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyPress={handleBarcodeKeyPress}
                  leftIcon={<ScanLine className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  onClick={() => handleBarcodeScan(barcodeInput)}
                >
                  Ara
                </Button>
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div>
            <label className="label">Ürün *</label>
            <select
              className="input"
              {...register('productId', {
                onChange: (e) => {
                  const product = products.find((p: any) => p.id === e.target.value);
                  setSelectedProduct(product);
                }
              })}
            >
              <option value="">Ürün seçin veya barkod okutun</option>
              {products.map((product: any) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku}) - Toplam: {product.totalStock} adet
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="mt-1 text-sm text-danger-600">{errors.productId.message}</p>
            )}
          </div>

          {/* Warehouse Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Kaynak Depo *</label>
              <select
                className="input"
                {...register('fromWarehouseId')}
              >
                <option value="">Depo seçin</option>
                {warehouses.map((warehouse: any) => {
                  const stock = selectedProduct?.stocks?.find((s: any) => s.warehouse.id === warehouse.id);
                  const qty = stock ? stock.quantity - stock.reservedQty : 0;
                  return (
                    <option key={warehouse.id} value={warehouse.id} disabled={qty === 0}>
                      {warehouse.name} ({warehouse.code}) - {qty} adet
                    </option>
                  );
                })}
              </select>
              {errors.fromWarehouseId && (
                <p className="mt-1 text-sm text-danger-600">{errors.fromWarehouseId.message}</p>
              )}
            </div>

            <div>
              <label className="label">Hedef Depo *</label>
              <select
                className="input"
                {...register('toWarehouseId')}
              >
                <option value="">Depo seçin</option>
                {warehouses
                  .filter((w: any) => w.id !== watchFromWarehouse)
                  .map((warehouse: any) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
              </select>
              {errors.toWarehouseId && (
                <p className="mt-1 text-sm text-danger-600">{errors.toWarehouseId.message}</p>
              )}
            </div>
          </div>

          {/* Available Stock Info */}
          {selectedProduct && watchFromWarehouse && (
            <div className="p-4 bg-primary-50 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-primary-700">Mevcut Stok:</span>
                <span className="font-bold text-primary-700">
                  {getAvailableStock()} adet
                </span>
              </div>
            </div>
          )}

          {/* Quantity */}
          <Input
            label="Miktar *"
            type="number"
            min={1}
            max={getAvailableStock()}
            placeholder="0"
            error={errors.quantity?.message}
            hint={`Maksimum: ${getAvailableStock()} adet`}
            {...register('quantity')}
          />

          {/* Note */}
          <div>
            <label className="label">Not (Opsiyonel)</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Sevkiyat notu..."
              {...register('note')}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setSelectedProduct(null);
              }}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={transferMutation.isPending}
              disabled={getAvailableStock() === 0}
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Sevkiyat Yap
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

