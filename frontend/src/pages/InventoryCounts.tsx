import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  ClipboardCheck,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Package,
  AlertTriangle,
  ScanLine,
  X,
  Camera,
  CameraOff,
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
  Select,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui';
import { formatDate, formatNumber, cn } from '@/utils';
import api from '@/services/api';

const countSchema = z.object({
  warehouseId: z.string().uuid('Depo seçin'),
  locationId: z.string().uuid().optional(),
  type: z.enum(['FULL', 'PARTIAL', 'CYCLE']),
  notes: z.string().optional(),
});

type CountForm = z.infer<typeof countSchema>;

export default function InventoryCounts() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState<any>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>({});
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [explanation, setExplanation] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  // Camera states
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.getWarehouses(),
  });

  const { data: countsData, isLoading } = useQuery({
    queryKey: ['inventory-counts'],
    queryFn: () => api.getInventoryCounts(),
    staleTime: 1000 * 60 * 2, // 2 minutes - data is fresh for 2 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch if data exists in cache
  });

  // Fetch count details when selected
  const { data: countDetails, refetch: refetchCountDetails } = useQuery({
    queryKey: ['inventory-count', selectedCount?.id],
    queryFn: () => api.getInventoryCount(selectedCount?.id),
    enabled: !!selectedCount?.id && isDetailModalOpen,
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchInterval: false, // Don't auto-refetch
  });

  // Clear local quantities when count details are refetched
  useEffect(() => {
    if (countDetails?.data) {
      // Only clear quantities that are not being actively edited
      setLocalQuantities((prev) => {
        const newState = { ...prev };
        // Keep only quantities that are different from server values
        // This allows for optimistic updates
        Object.keys(newState).forEach((itemId) => {
          const item = countDetails.data.items?.find((i: any) => i.id === itemId);
          if (item && newState[itemId] === item.countedQty) {
            delete newState[itemId];
          }
        });
        return newState;
      });
    }
  }, [countDetails]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CountForm>({
    resolver: zodResolver(countSchema),
  });

  // Watch warehouseId for location loading
  const selectedWarehouseId = watch('warehouseId') || '';

  // Get locations for selected warehouse
  const { data: locationsData } = useQuery({
    queryKey: ['locations', selectedWarehouseId],
    queryFn: () => api.getLocations(selectedWarehouseId, {}),
    enabled: !!selectedWarehouseId,
  });

  const createMutation = useMutation({
    mutationFn: (data: CountForm) => api.createInventoryCount(data),
    onSuccess: () => {
      // Invalidate and refetch only when needed
      queryClient.invalidateQueries({ 
        queryKey: ['inventory-counts'],
        refetchType: 'active', // Only refetch active queries
      });
      toast.success('Sayım oluşturuldu');
      setIsModalOpen(false);
      reset();
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.startInventoryCount(id),
    onSuccess: (data) => {
      // Optimistically update the cache instead of invalidating
      queryClient.setQueryData(['inventory-counts'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((count: any) =>
            count.id === data.data?.id ? { ...count, ...data.data } : count
          ),
        };
      });
      // Also update count details if it's open
      if (selectedCount?.id === data.data?.id) {
        queryClient.setQueryData(['inventory-count', data.data.id], data);
      }
      toast.success('Sayım başlatıldı');
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, explanation }: { id: string; explanation?: string }) => 
      api.completeInventoryCount(id, explanation ? { explanation } : undefined),
    onSuccess: (data) => {
      // Optimistically update the cache
      queryClient.setQueryData(['inventory-counts'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((count: any) =>
            count.id === data.data?.id ? { ...count, ...data.data } : count
          ),
        };
      });
      if (selectedCount?.id === data.data?.id) {
        queryClient.setQueryData(['inventory-count', data.data.id], data);
      }
      toast.success('Sayım tamamlandı');
      setIsCompleteModalOpen(false);
      setExplanation('');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Sayım tamamlanamadı';
      if (message.includes('açıklama')) {
        // Show modal if explanation is required
        setIsCompleteModalOpen(true);
      } else {
        toast.error(message);
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveInventoryCount(id),
    onSuccess: (data) => {
      // Optimistically update the cache
      queryClient.setQueryData(['inventory-counts'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((count: any) =>
            count.id === data.data?.id ? { ...count, ...data.data } : count
          ),
        };
      });
      if (selectedCount?.id === data.data?.id) {
        queryClient.setQueryData(['inventory-count', data.data.id], data);
      }
      // NOT: Stoklar güncellenmediği için stok query'lerini invalidate etmiyoruz
      toast.success('Sayım onaylandı');
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ countId, data }: { countId: string; data: any }) =>
      api.addCountItem(countId, data),
    onSuccess: (response, variables) => {
      // Update count details cache optimistically
      queryClient.setQueryData(['inventory-count', variables.countId], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            items: [...(old.data.items || []), response.data],
          },
        };
      });
      // Don't refetch - optimistic update is enough
      setBarcodeInput('');
      setQuantityInput('1');
      barcodeInputRef.current?.focus();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kalem eklenemedi');
      // Only refetch on error to get correct state
      refetchCountDetails();
    },
  });

  // Debounce timer for quantity updates
  const updateTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const updateItemMutation = useMutation({
    mutationFn: ({ countId, itemId, data }: { countId: string; itemId: string; data: any }) =>
      api.updateCountItem(countId, itemId, data),
    onSuccess: (response, variables) => {
      // Optimistically update count details cache
      queryClient.setQueryData(['inventory-count', variables.countId], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            items: old.data.items?.map((item: any) =>
              item.id === variables.itemId ? { ...item, ...response.data } : item
            ),
          },
        };
      });
      // Don't refetch immediately - let debounce handle it
      // Only refetch on blur to ensure consistency
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ countId, itemId }: { countId: string; itemId: string }) =>
      api.deleteInventoryCountItem(countId, itemId),
    onSuccess: (response, variables) => {
      // Optimistically update count details cache
      queryClient.setQueryData(['inventory-count', variables.countId], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            items: old.data.items?.filter((item: any) => item.id !== variables.itemId),
          },
        };
      });
      toast.success('Sayım kalemi silindi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kalem silinemedi');
      refetchCountDetails();
    },
  });

  // Debounced update function
  const debouncedUpdateItem = useCallback(
    (countId: string, itemId: string, countedQty: number) => {
      // Clear existing timer for this item
      if (updateTimersRef.current[itemId]) {
        clearTimeout(updateTimersRef.current[itemId]);
      }

      // Set new timer
      updateTimersRef.current[itemId] = setTimeout(() => {
        updateItemMutation.mutate({
          countId,
          itemId,
          data: { countedQty },
        });
        delete updateTimersRef.current[itemId];
      }, 800); // Wait 800ms after user stops typing
    },
    [updateItemMutation]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(updateTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const onSubmit = (data: CountForm) => {
    createMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary">Bekliyor</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="primary">Devam Ediyor</Badge>;
      case 'COMPLETED':
        return <Badge variant="warning">Tamamlandı</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Onaylandı</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Reddedildi</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Start camera scanner
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    
    try {
      setCameraError(null);
      
      html5QrcodeRef.current = new Html5Qrcode("inventory-count-scanner", {
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

  // Handle barcode scan (from camera or manual input)
  const handleBarcodeScan = async (scannedBarcode?: string) => {
    const barcode = scannedBarcode || barcodeInput.trim();
    if (!barcode.trim() || !selectedCount) return;

    const normalizedBarcode = barcode.trim();
    const quantity = parseInt(quantityInput) || 1;

    try {
      // ✅ GÜNCELLEME: Barcode, GTIN veya SKU ile ara
      let product;
      try {
        product = await api.getProductByBarcode(normalizedBarcode);
      } catch (error) {
        // ✅ GÜNCELLEME: Hata mesajını güncelle - SKU da kabul ediliyor
        toast.error(`Ürün bulunamadı: ${normalizedBarcode}. Barkod, GTIN veya SKU okutun.`);
        setBarcodeInput('');
        if (!isCameraMode) {
          barcodeInputRef.current?.focus();
        }
        return;
      }

      if (!product?.data) {
        toast.error(`Ürün bulunamadı: ${normalizedBarcode}`);
        setBarcodeInput('');
        if (!isCameraMode) {
          barcodeInputRef.current?.focus();
        }
        return;
      }

      // Check if item already exists in count (same product, no variant or same variant)
      const existingItem = countDetails?.data?.items?.find(
        (item: any) => item.productId === product.data.id && !item.variantId
      );

      if (existingItem) {
        // Update existing item
        updateItemMutation.mutate({
          countId: selectedCount.id,
          itemId: existingItem.id,
          data: {
            countedQty: existingItem.countedQty + quantity,
          },
        });
        toast.success(`${product.data.name} miktarı güncellendi`);
      } else {
        // Add new item
        addItemMutation.mutate({
          countId: selectedCount.id,
          data: {
            productId: product.data.id,
            countedQty: quantity,
          },
        });
        toast.success(`${product.data.name} eklendi`);
      }
      
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
      handleBarcodeScan();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Stop camera when modal closes
  useEffect(() => {
    if (!isDetailModalOpen && isCameraActive) {
      stopCamera();
      setIsCameraMode(false);
    }
  }, [isDetailModalOpen]);

  // Open detail modal
  const openDetailModal = (count: any) => {
    setSelectedCount(count);
    setIsDetailModalOpen(true);
    setBarcodeInput('');
    setQuantityInput('1');
  };

  // Close detail modal
  const closeDetailModal = async () => {
    // Stop camera if active
    if (isCameraActive) {
      await stopCamera();
      setIsCameraMode(false);
    }
    setIsDetailModalOpen(false);
    setSelectedCount(null);
    setBarcodeInput('');
    setQuantityInput('1');
    setLocalQuantities({});
    // Clear all pending timers
    Object.values(updateTimersRef.current).forEach((timer) => clearTimeout(timer));
    updateTimersRef.current = {};
  };

  // Focus barcode input when modal opens
  useEffect(() => {
    if (isDetailModalOpen && selectedCount?.status === 'IN_PROGRESS') {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isDetailModalOpen, selectedCount]);

  const warehouses = warehousesData?.data || [];
  const counts = countsData?.data || [];
  const countItems = countDetails?.data?.items || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stok Sayım</h1>
          <p className="text-secondary-500">Stok sayım görevlerini yönetin</p>
        </div>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            reset({
              warehouseId: '',
              type: 'FULL',
            });
            setIsModalOpen(true);
          }}
        >
          Yeni Sayım
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : counts.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Kod</TableHeader>
                  <TableHeader>Depo</TableHeader>
                  <TableHeader>Lokasyon</TableHeader>
                  <TableHeader>Tip</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Kalem Sayısı</TableHeader>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader>İşlemler</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {counts.map((count: any) => (
                  <TableRow key={count.id}>
                    <TableCell className="font-medium">{count.code}</TableCell>
                    <TableCell>{count.warehouse?.name || '-'}</TableCell>
                    <TableCell>
                      {count.location ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-secondary-900">
                            {count.location.code}
                          </span>
                          {count.location.name && (
                            <span className="text-xs text-secondary-500">
                              ({count.location.name})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-secondary-400">Tüm Lokasyonlar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {count.type === 'FULL' ? 'Tam Sayım' :
                       count.type === 'PARTIAL' ? 'Kısmi Sayım' : 'Döngüsel Sayım'}
                    </TableCell>
                    <TableCell>{getStatusBadge(count.status)}</TableCell>
                    <TableCell>{count._count?.items || 0}</TableCell>
                    <TableCell>{formatDate(count.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailModal(count)}
                        >
                          <Package className="w-4 h-4" />
                        </Button>
                        {count.status === 'PENDING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startMutation.mutate(count.id)}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {count.status === 'IN_PROGRESS' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCount(count);
                              // Try to complete - if explanation needed, modal will open via onError
                              completeMutation.mutate({ id: count.id });
                            }}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {count.status === 'COMPLETED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => approveMutation.mutate(count.id)}
                          >
                            <CheckCircle className="w-4 h-4 text-success-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <ClipboardCheck className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Sayım bulunamadı
              </h3>
              <p className="text-secondary-500 mb-4">
                Yeni bir sayım görevi oluşturun
              </p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Sayımı Oluştur
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Sayım"
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Select
            label="Depo *"
            options={[
              { value: '', label: 'Depo seçin' },
              ...warehouses.map((w: any) => ({ value: w.id, label: w.name })),
            ]}
            placeholder="Depo seçin"
            error={errors.warehouseId?.message}
            {...register('warehouseId', { required: 'Depo seçin' })}
          />

          {selectedWarehouseId && (
            <div className="space-y-2">
              {locationsData?.data && locationsData.data.length > 0 ? (
                <>
                  <Select
                    label="Lokasyon"
                    options={[
                      { value: '', label: 'Tüm Lokasyonlar (Depo Geneli)' },
                      ...locationsData.data.map((loc: any) => ({
                        value: loc.id,
                        label: `${loc.code}${loc.name ? ` - ${loc.name}` : ''}`,
                      })),
                    ]}
                    {...register('locationId')}
                  />
                  <p className="text-xs text-secondary-500">
                    <strong>Tüm Lokasyonlar:</strong> Depodaki her lokasyondaki stoklar ayrı ayrı listelenir.
                    <br />
                    <strong>Tek Lokasyon:</strong> Sadece seçilen lokasyondaki stoklar listelenir.
                  </p>
                </>
              ) : (
                <p className="text-xs text-warning-600 bg-warning-50 p-3 rounded-lg">
                  Bu depoda tanımlı lokasyon yok. Sayım depo genelinde yapılacak.
                </p>
              )}
            </div>
          )}

          <Select
            label="Sayım Tipi *"
            options={[
              { value: 'FULL', label: 'Tam Sayım' },
              { value: 'PARTIAL', label: 'Kısmi Sayım' },
              { value: 'CYCLE', label: 'Döngüsel Sayım' },
            ]}
            error={errors.type?.message}
            {...register('type')}
          />

          <Input
            label="Notlar"
            placeholder="Sayım hakkında notlar"
            error={errors.notes?.message}
            {...register('notes')}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending}
            >
              Oluştur
            </Button>
          </div>
        </form>
      </Modal>

      {/* Count Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        title={`Sayım Detayı - ${selectedCount?.code || ''}`}
        size="xl"
      >
        {selectedCount && (
          <div className="space-y-6">
            {/* Count Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary-50 rounded-lg">
              <div>
                <div className="text-sm text-secondary-500">Depo</div>
                <div className="font-medium">{selectedCount.warehouse?.name || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-secondary-500">Sayım Kapsamı</div>
                <div className="font-medium">
                  {selectedCount.location ? (
                    <Badge variant="primary" className="text-xs">
                      {selectedCount.location.code}
                      {selectedCount.location.name && ` (${selectedCount.location.name})`}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Tüm Lokasyonlar</Badge>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-secondary-500">Durum</div>
                <div>{getStatusBadge(selectedCount.status)}</div>
              </div>
              <div>
                <div className="text-sm text-secondary-500">Tip</div>
                <div className="text-sm">
                  {selectedCount.type === 'FULL' ? 'Tam Sayım' :
                   selectedCount.type === 'PARTIAL' ? 'Kısmi Sayım' : 'Döngüsel Sayım'}
                </div>
              </div>
            </div>

            {/* Tamamlanmış/Onaylanmış Sayım Bilgileri */}
            {(selectedCount.status === 'COMPLETED' || selectedCount.status === 'APPROVED') && (
              <div className={cn(
                "p-4 rounded-lg",
                selectedCount.status === 'APPROVED' ? "bg-success-50" : "bg-warning-50"
              )}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-secondary-500">Oluşturan</div>
                    <div className="font-medium">
                      {selectedCount.createdBy?.firstName} {selectedCount.createdBy?.lastName}
                    </div>
                  </div>
                  <div>
                    <div className="text-secondary-500">Oluşturma Tarihi</div>
                    <div className="font-medium">{formatDate(selectedCount.createdAt)}</div>
                  </div>
                  {selectedCount.completedAt && (
                    <div>
                      <div className="text-secondary-500">Tamamlanma Tarihi</div>
                      <div className="font-medium">{formatDate(selectedCount.completedAt)}</div>
                    </div>
                  )}
                  {selectedCount.status === 'APPROVED' && selectedCount.approvedBy && (
                    <div>
                      <div className="text-secondary-500">Onaylayan</div>
                      <div className="font-medium">
                        {selectedCount.approvedBy?.firstName} {selectedCount.approvedBy?.lastName}
                      </div>
                    </div>
                  )}
                </div>
                {selectedCount.notes && (
                  <div className="mt-3 pt-3 border-t border-secondary-200">
                    <div className="text-secondary-500 text-sm">Açıklama/Notlar</div>
                    <div className="text-sm mt-1">{selectedCount.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* Lokasyon Bazlı Özet - Sadece tüm lokasyonlar seçildiyse göster */}
            {!selectedCount.location && countItems.length > 0 && (
              <div className="p-4 bg-primary-50 rounded-lg">
                <h4 className="font-medium text-primary-900 mb-3">Lokasyon Bazlı Özet</h4>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    // Lokasyonlara göre grupla
                    const locationGroups: Record<string, { code: string; name?: string; total: number; counted: number; diff: number }> = {};
                    countItems.forEach((item: any) => {
                      const locKey = item.location?.id || 'no-location';
                      if (!locationGroups[locKey]) {
                        locationGroups[locKey] = {
                          code: item.location?.code || 'Lokasyonsuz',
                          name: item.location?.name,
                          total: 0,
                          counted: 0,
                          diff: 0,
                        };
                      }
                      locationGroups[locKey].total++;
                      if (item.countedQty > 0) locationGroups[locKey].counted++;
                      if (item.difference !== 0) locationGroups[locKey].diff++;
                    });
                    
                    return Object.entries(locationGroups).map(([key, loc]) => (
                      <div 
                        key={key} 
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs",
                          loc.counted === loc.total && loc.diff === 0 
                            ? "bg-success-100 text-success-800"
                            : loc.counted === loc.total 
                              ? "bg-warning-100 text-warning-800"
                              : "bg-secondary-100 text-secondary-800"
                        )}
                      >
                        <div className="font-medium">{loc.code}</div>
                        <div className="text-[10px] opacity-75">
                          {loc.counted}/{loc.total} sayıldı
                          {loc.diff > 0 && ` • ${loc.diff} fark`}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Barcode Scanner - Only show for IN_PROGRESS */}
            {selectedCount.status === 'IN_PROGRESS' && (
              <Card>
                <CardBody>
                  <div className="space-y-4">
                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                      <Button
                        variant={!isCameraMode ? 'primary' : 'secondary'}
                        onClick={() => {
                          if (isCameraMode) toggleCameraMode();
                        }}
                        className="flex-1"
                        size="sm"
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
                        size="sm"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Kamera ile Oku
                      </Button>
                    </div>

                    {isCameraMode ? (
                      <div className="space-y-4">
                        {/* Camera Scanner */}
                        <div 
                          id="inventory-count-scanner" 
                          ref={scannerContainerRef}
                          className="w-full rounded-xl overflow-hidden bg-black"
                          style={{ minHeight: '300px' }}
                        />
                        
                        {cameraError && (
                          <div className="flex items-center gap-2 p-4 bg-error-50 rounded-xl text-error-700">
                            <CameraOff className="w-5 h-5" />
                            <div>
                              <p className="font-medium">Kamera Hatası</p>
                              <p className="text-sm">{cameraError}</p>
                            </div>
                          </div>
                        )}

                        {!isCameraActive && !cameraError && (
                          <Button onClick={startCamera} className="w-full">
                            <Camera className="w-4 h-4 mr-2" />
                            Kamerayı Başlat
                          </Button>
                        )}

                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-3">
                            <Input
                              type="number"
                              placeholder="Miktar"
                              value={quantityInput}
                              onChange={(e) => setQuantityInput(e.target.value)}
                              min="1"
                            />
                          </div>
                        </div>

                        <p className="text-center text-sm text-secondary-500">
                          EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 desteklenir
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ScanLine className="w-5 h-5 text-primary-600" />
                          <h3 className="font-semibold">Barkod Okut</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <Input
                              ref={barcodeInputRef}
                              placeholder="Barkod veya SKU okutun..."
                              value={barcodeInput}
                              onChange={(e) => setBarcodeInput(e.target.value)}
                              onKeyPress={handleBarcodeKeyPress}
                              autoFocus
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              placeholder="Miktar"
                              value={quantityInput}
                              onChange={(e) => setQuantityInput(e.target.value)}
                              min="1"
                            />
                          </div>
                        </div>
                        <Button
                          onClick={() => handleBarcodeScan()}
                          isLoading={addItemMutation.isPending || updateItemMutation.isPending}
                          className="w-full"
                        >
                          <ScanLine className="w-4 h-4 mr-2" />
                          Ekle / Güncelle
                        </Button>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Count Items Table */}
            <div>
              <h3 className="font-semibold mb-3">Sayım Kalemleri</h3>
              {countItems.length > 0 ? (
                <div className="border border-secondary-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Ürün</TableHeader>
                        <TableHeader>Lokasyon</TableHeader>
                        <TableHeader>Sistem</TableHeader>
                        <TableHeader>Hedef</TableHeader>
                        <TableHeader>Sayılan</TableHeader>
                        <TableHeader>Fark</TableHeader>
                        {selectedCount.status === 'IN_PROGRESS' && (
                          <TableHeader>İşlem</TableHeader>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {countItems.map((item: any) => {
                        const difference = item.countedQty - item.systemQty;
                        const targetQty = item.targetQty || item.systemQty;
                        const meetsTarget = item.countedQty >= targetQty;
                        const hasDifference = difference !== 0;
                        const isNotCounted = item.countedQty === 0 && item.systemQty > 0;
                        return (
                          <TableRow 
                            key={item.id}
                            className={cn(
                              hasDifference && difference > 0 && 'bg-success-50',
                              hasDifference && difference < 0 && 'bg-danger-50',
                              isNotCounted && 'bg-warning-50'
                            )}
                          >
                            <TableCell className="font-medium">
                              <div>
                                {item.product?.name || '-'}
                                {item.variant?.name && (
                                  <span className="text-secondary-500 text-xs ml-1">
                                    ({item.variant.name})
                                  </span>
                                )}
                              </div>
                              {isNotCounted && (
                                <span className="text-xs text-warning-600 font-normal">
                                  Sayılmadı
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.location ? (
                                <Badge variant="secondary" className="text-xs">
                                  {item.location.code}
                                  {item.location.name && (
                                    <span className="text-secondary-400 ml-1">
                                      ({item.location.name})
                                    </span>
                                  )}
                                </Badge>
                              ) : (
                                <span className="text-secondary-400 text-xs">Lokasyonsuz</span>
                              )}
                            </TableCell>
                            <TableCell>{formatNumber(item.systemQty)}</TableCell>
                            <TableCell>
                              <span className={cn(
                                'font-medium',
                                !meetsTarget && 'text-warning-600'
                              )}>
                                {formatNumber(targetQty)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {selectedCount.status === 'IN_PROGRESS' ? (
                                <Input
                                  type="number"
                                  value={localQuantities[item.id] ?? item.countedQty}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 0;
                                    // Update local state immediately for UI responsiveness
                                    setLocalQuantities((prev) => ({
                                      ...prev,
                                      [item.id]: newQty,
                                    }));
                                    // Debounce the API call
                                    debouncedUpdateItem(selectedCount.id, item.id, newQty);
                                  }}
                                  onBlur={(e) => {
                                    // Also update on blur to ensure final value is saved
                                    const newQty = parseInt(e.target.value) || 0;
                                    if (updateTimersRef.current[item.id]) {
                                      clearTimeout(updateTimersRef.current[item.id]);
                                      delete updateTimersRef.current[item.id];
                                    }
                                    updateItemMutation.mutate(
                                      {
                                        countId: selectedCount.id,
                                        itemId: item.id,
                                        data: { countedQty: newQty },
                                      },
                                      {
                                        onSuccess: () => {
                                          // Refetch only on blur to ensure consistency
                                          refetchCountDetails();
                                        },
                                      }
                                    );
                                    // Clear local state after save
                                    setLocalQuantities((prev) => {
                                      const newState = { ...prev };
                                      delete newState[item.id];
                                      return newState;
                                    });
                                  }}
                                  className="w-24"
                                  min="0"
                                />
                              ) : (
                                formatNumber(item.countedQty)
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  'font-medium',
                                  difference > 0
                                    ? 'text-success-600'
                                    : difference < 0
                                    ? 'text-danger-600'
                                    : 'text-secondary-600'
                                )}
                              >
                                {difference > 0 ? '+' : ''}
                                {formatNumber(difference)}
                              </span>
                            </TableCell>
                            {selectedCount.status === 'IN_PROGRESS' && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm('Bu kalemi silmek istediğinize emin misiniz?')) {
                                      deleteItemMutation.mutate({
                                        countId: selectedCount.id,
                                        itemId: item.id,
                                      });
                                    }
                                  }}
                                  isLoading={deleteItemMutation.isPending}
                                  className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-secondary-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-secondary-300" />
                  <p>Henüz sayım kalemi eklenmedi</p>
                  {selectedCount.status === 'IN_PROGRESS' && (
                    <p className="text-sm mt-1">Barkod okutarak kalem ekleyin</p>
                  )}
                </div>
              )}
            </div>

            {/* Summary Stats */}
            {countItems.length > 0 && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-secondary-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-secondary-900">
                    {countItems.length}
                  </div>
                  <div className="text-xs text-secondary-500">Toplam Kalem</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-success-600">
                    {countItems.filter((item: any) => item.countedQty > 0 && item.difference === 0).length}
                  </div>
                  <div className="text-xs text-secondary-500">Doğru Sayılan</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-danger-600">
                    {countItems.filter((item: any) => item.difference !== 0).length}
                  </div>
                  <div className="text-xs text-secondary-500">Fark Olan</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              {selectedCount.status === 'IN_PROGRESS' && (
                <Button
                  onClick={() => {
                    // Sayılmamış kalem var mı kontrol et
                    const uncountedItems = countItems.filter((item: any) => 
                      item.countedQty === 0 && item.systemQty > 0
                    );
                    
                    if (uncountedItems.length > 0) {
                      toast.error(`${uncountedItems.length} kalem henüz sayılmadı!`);
                      return;
                    }
                    
                    // Fark olan kalemler var mı kontrol et
                    const itemsWithDifference = countItems.filter((item: any) => 
                      item.difference !== 0
                    );
                    
                    if (itemsWithDifference.length > 0) {
                      setIsCompleteModalOpen(true);
                    } else {
                      completeMutation.mutate({ id: selectedCount.id });
                    }
                  }}
                  isLoading={completeMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Sayımı Tamamla
                </Button>
              )}
              <Button variant="secondary" onClick={closeDetailModal}>
                Kapat
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Complete with Explanation Modal */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => {
          setIsCompleteModalOpen(false);
          setExplanation('');
        }}
        title="Sayımı Tamamla - Fark Tespit Edildi"
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-warning-50 rounded-xl">
            <div className="flex items-center gap-3 text-warning-700">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <div>
                <p className="font-semibold">Stok Farkı Tespit Edildi</p>
                <p className="text-sm">
                  Aşağıdaki ürünlerde sistem stoğu ile sayılan miktar arasında fark var.
                  Devam etmek için açıklama ekleyin.
                </p>
              </div>
            </div>
          </div>

          {/* Fark olan ürünlerin listesi */}
          <div className="max-h-60 overflow-y-auto border border-secondary-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-secondary-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Ürün</th>
                  <th className="text-right p-2 font-medium">Sistem</th>
                  <th className="text-right p-2 font-medium">Sayılan</th>
                  <th className="text-right p-2 font-medium">Fark</th>
                </tr>
              </thead>
              <tbody>
                {countItems
                  .filter((item: any) => item.difference !== 0)
                  .map((item: any) => (
                    <tr key={item.id} className="border-t border-secondary-100">
                      <td className="p-2">
                        {item.product?.name || '-'}
                        {item.variant?.name && (
                          <span className="text-secondary-500 text-xs ml-1">
                            ({item.variant.name})
                          </span>
                        )}
                      </td>
                      <td className="text-right p-2">{formatNumber(item.systemQty)}</td>
                      <td className="text-right p-2">{formatNumber(item.countedQty)}</td>
                      <td className={cn(
                        'text-right p-2 font-medium',
                        item.difference > 0 ? 'text-success-600' : 'text-danger-600'
                      )}>
                        {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Açıklama (Zorunlu) *
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Stok farkının nedenini açıklayın (örn: kırık ürünler, sayım hatası, kayıp vb.)"
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCompleteModalOpen(false);
                setExplanation('');
              }}
            >
              İptal
            </Button>
            <Button
              onClick={() => {
                if (!explanation.trim()) {
                  toast.error('Lütfen açıklama ekleyin');
                  return;
                }
                completeMutation.mutate({ 
                  id: selectedCount?.id || '', 
                  explanation: explanation.trim() 
                });
              }}
              isLoading={completeMutation.isPending}
              disabled={!explanation.trim()}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Onayla ve Tamamla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

