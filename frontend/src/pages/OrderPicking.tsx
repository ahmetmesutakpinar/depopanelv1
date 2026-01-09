import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Package,
  CheckCircle,
  AlertTriangle,
  Truck,
  Search,
  Volume2,
  VolumeX,
  MapPin,
  RefreshCw,
  Waves,
  Plus,
  Play,
  Eye,
  ShoppingCart,
  Keyboard,
  Camera,
  CameraOff,
  ScanLine,
  Trash2,
  Edit,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Input,
  Badge,
  Card,
  CardBody,
  Modal,
  Select,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui';
import { formatCurrency, formatDate, cn } from '@/utils';
import api from '@/services/api';
import type { Order } from '@/utils/types';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/context/AuthContext';

// ===== PICKING WAVES TAB COMPONENT =====
const waveSchema = z.object({
  warehouseId: z.string().min(1, 'Depo seçin').uuid('Geçersiz depo ID'),
});

type WaveForm = z.infer<typeof waveSchema>;

interface PickingWavesTabProps {
  onWaveStarted?: (waveId: string) => void;
}

function PickingWavesTab({ onWaveStarted }: PickingWavesTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  // ✅ SİLME YETKİSİ: ADMIN, SUPER_ADMIN ve STAFF dalga silebilir
  const canDeleteWave = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'STAFF';
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedWaveForStatus, setSelectedWaveForStatus] = useState<any>(null);
  const [selectedNewStatus, setSelectedNewStatus] = useState<string>('');

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const { data: wavesData, isLoading } = useQuery({
    queryKey: ['picking-waves'],
    queryFn: () => api.getPickingWaves(),
  });

  // Varsayılan depoyu bul
  // Varsayılan depoyu bul
  const warehouses = (warehousesData?.data || []).filter((w: any) => w.isActive === true);
  const defaultWarehouse = warehouses.find((w: any) => w.isDefault) || warehouses[0];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WaveForm>({
    resolver: zodResolver(waveSchema),
    defaultValues: {
      warehouseId: defaultWarehouse?.id || '',
    },
  });

  const autoCreateMutation = useMutation({
    mutationFn: (data: any) => api.autoCreatePickingWave(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Toplama dalgası otomatik oluşturuldu');
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Toplama dalgası oluşturulamadı');
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.startPickingWave(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      const waveId = data.data?.id;
      // ✅ OTOMATIK SEKME GEÇİŞİ: Dalga başlatıldığında otomatik olarak Sipariş Hazırlama sekmesine geç
      if (waveId && onWaveStarted) {
        onWaveStarted(waveId); // Bu zaten setActiveTab('picking') yapıyor
        toast.success('Dalga başlatıldı, hazırlamaya geçiliyor...');
      } else {
        toast.success('Toplama dalgası başlatıldı');
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Dalga başlatılamadı');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.completePicking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Toplama dalgası tamamlandı');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePickingWave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Toplama dalgası silindi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Dalga silinemedi');
    },
  });

  // ✅ DURUM DEĞİŞTİRME: Dalga durumunu güncelle
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      api.updatePickingWave(id, { status: status as any }),
      onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Dalga durumu güncellendi');
      setIsStatusModalOpen(false);
      setSelectedWaveForStatus(null);
      setSelectedNewStatus('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Durum güncellenemedi');
    },
  });

  const markPickedMutation = useMutation({
    mutationFn: (id: string) => api.markPickingWaveAsPicked(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Toplama işlemi kaydedildi');
    },
  });

  const markShippedMutation = useMutation({
    mutationFn: (id: string) => api.markPickingWaveAsShipped(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Gönderim işlemi kaydedildi');
    },
  });


  // Mutations moved to WaveDetail page

  const closeWaveMutation = useMutation({
    mutationFn: (id: string) => api.closeWave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      toast.success('Dalga kapatıldı');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Dalga kapatılamadı');
    },
  });

  // Barcode scanning moved to WaveDetail page

  // Camera and barcode scanning moved to WaveDetail page

  const handleCreate = (data: WaveForm) => {
    const warehouseId = (data.warehouseId || '').trim();
    if (!warehouseId || !warehouseId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      toast.error('Geçerli bir depo seçin');
      return;
    }
    const payload: any = { 
      warehouseId, 
      strategy: 'WAVE', // Default strategy for backend
      maxOrders: 100 
    };
    autoCreateMutation.mutate(payload);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
      case 'CREATED': return <Badge variant="secondary">Bekliyor</Badge>;
      case 'IN_PROGRESS':
      case 'PICKING': return <Badge variant="primary">Toplanıyor</Badge>;
      case 'PACKING': return <Badge variant="warning">Paketleniyor</Badge>;
      case 'SHIPPED': return <Badge variant="primary">Gönderildi</Badge>;
      case 'CLOSED':
      case 'COMPLETED': return <Badge variant="success">Tamamlandı</Badge>;
      case 'CANCELLED': return <Badge variant="danger">İptal Edildi</Badge>;
      case 'EXCEPTION': return <Badge variant="danger">Hata</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // ✅ DURUM SEÇENEKLERİ: Dalga durumları
  const statusOptions = [
    { value: 'CREATED', label: 'Oluşturuldu' },
    { value: 'PENDING', label: 'Bekliyor' },
    { value: 'IN_PROGRESS', label: 'Devam Ediyor' },
    { value: 'PICKING', label: 'Toplanıyor' },
    { value: 'PACKING', label: 'Paketleniyor' },
    { value: 'SHIPPED', label: 'Gönderildi' },
    { value: 'COMPLETED', label: 'Tamamlandı' },
    { value: 'CLOSED', label: 'Kapatıldı' },
    { value: 'CANCELLED', label: 'İptal Edildi' },
    { value: 'EXCEPTION', label: 'Hata' },
  ];

  const handleStatusChange = (wave: any) => {
    setSelectedWaveForStatus(wave);
    setSelectedNewStatus('');
    setIsStatusModalOpen(true);
  };

  const handleConfirmStatusChange = () => {
    if (selectedWaveForStatus && selectedNewStatus) {
      updateStatusMutation.mutate({
        id: selectedWaveForStatus.id,
        status: selectedNewStatus,
      });
    } else {
      toast.error('Lütfen bir durum seçin');
    }
  };

  const getWaveTypeLabel = (type?: string) => {
    switch (type) {
      case 'TIME_BASED': return 'Zaman Bazlı';
      case 'SKU_BASED': return 'SKU Bazlı';
      case 'PRIORITY': return 'Öncelikli';
      case 'MANUAL': return 'Manuel';
      case 'MARKETPLACE': return 'Marketplace';
      case 'SHIPPING': return 'Kargo';
      case 'COUNTRY': return 'Ülke';
      case 'MIXED': return 'Karma';
      default: return type || 'Manuel';
    }
  };

  const getStrategyLabel = (strategy: string) => {
    switch (strategy) {
      case 'SINGLE_ORDER': return 'Tek Sipariş';
      case 'WAVE': return 'Dalga';
      case 'BATCH': return 'Toplu';
      case 'ZONE': return 'Bölge';
      default: return strategy;
    }
  };

  const waves = wavesData?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            reset({ warehouseId: defaultWarehouse?.id || '' });
            setIsModalOpen(true);
          }}
        >
          Oluştur
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : waves.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Kod</TableHeader>
                  <TableHeader>Depo</TableHeader>
                  <TableHeader>Strateji</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Sipariş Sayısı</TableHeader>
                  <TableHeader>Öncelik</TableHeader>
                  <TableHeader>Tarih</TableHeader>
                  <TableHeader>İşlemler</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {waves.map((wave: any) => (
                  <TableRow key={wave.id}>
                    <TableCell className="font-medium">{wave.code}</TableCell>
                    <TableCell>{wave.warehouse?.name || '-'}</TableCell>
                    <TableCell>{getStrategyLabel(wave.strategy)}</TableCell>
                    <TableCell>{getStatusBadge(wave.status)}</TableCell>
                    <TableCell>{wave._count?.orders || 0}</TableCell>
                    <TableCell>{wave.priority}</TableCell>
                    <TableCell>{formatDate(wave.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/picking-waves/${wave.id}`)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {(wave.status === 'PENDING' || wave.status === 'CREATED') && (
                          <Button variant="ghost" size="sm" onClick={() => startMutation.mutate(wave.id)}>
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {(wave.status === 'IN_PROGRESS' || wave.status === 'PICKING') && (
                          <Button variant="ghost" size="sm" onClick={() => completeMutation.mutate(wave.id)}>
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {/* ✅ Durum değiştirme butonu: ADMIN, SUPER_ADMIN ve STAFF görebilir */}
                        {canDeleteWave && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleStatusChange(wave)}
                            title="Durum değiştir"
                            className="text-primary-600 hover:text-primary-700 hover:bg-primary-50"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {/* ✅ Silme butonu: ADMIN, SUPER_ADMIN ve STAFF görebilir - Tüm durumlarda görünür (backend kontrol eder) */}
                        {canDeleteWave && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              if (window.confirm(`"${wave.code}" dalgasını silmek istediğinize emin misiniz?`)) {
                                deleteMutation.mutate(wave.id);
                              }
                            }}
                            isLoading={deleteMutation.isPending}
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                            title="Dalga sil"
                          >
                            <Trash2 className="w-4 h-4" />
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
              <Waves className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">Toplama dalgası bulunamadı</h3>
              <p className="text-secondary-500 mb-4">Yeni bir toplama dalgası oluşturun</p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Dalgayı Oluştur
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create Wave Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Yeni Toplama Dalgası" size="md">
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-5">
          <Select
            label="Depo *"
            options={[{ value: '', label: 'Depo seçin' }, ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))]}
            error={errors.warehouseId?.message}
            {...register('warehouseId', { required: 'Depo seçin' })}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>İptal</Button>
            <Button type="submit" isLoading={autoCreateMutation.isPending}>Oluştur</Button>
          </div>
        </form>

      </Modal>

      {/* ✅ DURUM DEĞİŞTİRME MODAL */}
      <Modal 
        isOpen={isStatusModalOpen} 
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedWaveForStatus(null);
        }} 
        title="Dalga Durumu Değiştir"
        size="md"
      >
        {selectedWaveForStatus && (
          <div className="space-y-5">
            <div className="p-4 bg-secondary-50 rounded-xl">
              <p className="text-sm text-secondary-600 mb-1">Dalga Kodu</p>
              <p className="font-semibold text-secondary-900">{selectedWaveForStatus.code}</p>
              <p className="text-sm text-secondary-500 mt-1">Mevcut Durum: {getStatusBadge(selectedWaveForStatus.status)}</p>
            </div>

            <div>
              <Select
                label="Yeni Durum Seçin"
                options={[
                  { value: '', label: 'Durum seçin' },
                  ...statusOptions.map(opt => ({
                    value: opt.value,
                    label: opt.label,
                  })),
                ]}
                value={selectedNewStatus}
                onChange={(e) => setSelectedNewStatus(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => {
                  setIsStatusModalOpen(false);
                  setSelectedWaveForStatus(null);
                  setSelectedNewStatus('');
                }}
              >
                İptal
              </Button>
              <Button 
                type="button"
                onClick={handleConfirmStatusChange}
                isLoading={updateStatusMutation.isPending}
                disabled={!selectedNewStatus}
              >
                Güncelle
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Modal removed - now using full page route at /picking-waves/:id */}
    </div>
  );
}

interface ScannedItem {
  orderItemId: string;
  sku: string;
  barcode: string;
  allBarcodes: string[]; // Tüm olası barkodlar (GTIN, barcode - SKU'lar hariç)
  name: string;
  requiredQty: number;
  scannedQty: number;
  isComplete: boolean;
  locationId?: string | null; // Lokasyon bilgisi
  locationCode?: string | null; // Lokasyon kodu
}

// ===== ORDER PICKING TAB COMPONENT =====
interface OrderPickingTabProps {
  activeWaveId?: string | null;
  onClearActiveWave?: () => void;
}

function OrderPickingTab({ activeWaveId, onClearActiveWave }: OrderPickingTabProps) {
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [lastScanStatus, setLastScanStatus] = useState<'success' | 'error' | 'warning' | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); // ✅ ARAMA: Sipariş arama sorgusu
  
  // Camera states
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Fetch active wave details if wave mode is active
  const { data: activeWaveData } = useQuery({
    queryKey: ['picking-wave', activeWaveId],
    queryFn: () => api.getPickingWave(activeWaveId!),
    enabled: !!activeWaveId,
  });

  // Fetch pending orders - filter by wave if active
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['pending-orders', activeWaveId],
    queryFn: () => {
      if (activeWaveId) {
        // If wave is active, get orders from that wave
        return api.getOrders({ 
          status: 'PENDING', 
          limit: 100,
          pickingWaveId: activeWaveId 
        });
      }
      // Otherwise get all pending orders
      return api.getOrders({ status: 'PENDING', limit: 50 });
    },
  });

  // ✅ FIX: Fetch products for SKU-based matching
  const { data: productsData } = useQuery({
    queryKey: ['products-for-picking'],
    queryFn: () => api.getProducts({ limit: 10000, isActive: true }),
  });

  const products = productsData?.data || [];

  // ✅ FIX: Helper function to find product by SKU (case-insensitive)
  const findProductBySku = (sku: string | null | undefined): any => {
    if (!sku) return null;
    return products.find((p: any) => 
      p.sku?.toUpperCase().trim() === sku.toUpperCase().trim() && 
      p.isActive
    ) || null;
  };

  // ✅ KLAVYE KISAYOLLARI: ESC ve Ctrl+K desteği
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // ESC: Seçili siparişi temizle
      if (e.key === 'Escape' && selectedOrder) {
        e.preventDefault();
        setSelectedOrder(null);
        setScannedItems([]);
        if (isCameraActive) {
          stopCamera();
          setIsCameraMode(false);
        }
      }
      
      // Ctrl/Cmd + K: Barkod input'a focus (sadece kamera modu kapalıysa)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !isCameraMode) {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedOrder, isCameraMode, isCameraActive]);

  // Update scanned items with location info when order is selected
  useEffect(() => {
    if (!selectedOrder?.items || scannedItems.length === 0) return;
    
    const updateLocations = async () => {
      const updatedItems = await Promise.all(
        scannedItems.map(async (item) => {
          const orderItem = selectedOrder.items.find((oi: any) => oi.id === item.orderItemId);
          if (!orderItem) return item;
          
          // ✅ FIX: Only fetch locations if product exists (by productId or SKU match)
          const productId = orderItem.productId || orderItem.product?.id;
          if (productId) {
            try {
              const locations = await api.getProductLocations(productId, orderItem.variant?.id);
              const primaryLocation = locations.data?.find((loc: any) => loc.isPrimary);
              if (primaryLocation && !item.locationCode) {
                // primaryLocation is a location assignment object with location property
                const loc = (primaryLocation as any).location || primaryLocation;
                return {
                  ...item,
                  locationCode: loc.code,
                  locationId: loc.id,
                };
              }
            } catch (error) {
              // Ignore errors - location might not exist
            }
          }
          return item;
        })
      );
      
      // Only update if locations were found
      const hasLocations = updatedItems.some(item => item.locationCode);
      if (hasLocations) {
        setScannedItems(updatedItems);
      }
    };
    
    updateLocations();
  }, [selectedOrder?.id]); // Only run when order changes

  // Update order status mutation - sipariş tamamlandığında stok düşer
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateOrderStatus(id, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      
      // If active wave exists, check if all orders are complete
      if (activeWaveId) {
        queryClient.invalidateQueries({ queryKey: ['picking-wave', activeWaveId] });
        
        // Wait a bit for query to update, then check
        setTimeout(async () => {
          try {
            const waveData = await api.getPickingWave(activeWaveId);
            const wave = waveData.data;
            
            if (wave && wave.status === 'IN_PROGRESS') {
              // Eğer backend'den hiç sipariş gelmiyorsa, tüm siparişler SHIPPED demektir
              // (çünkü backend'de SHIPPED siparişleri filtreliyoruz)
              const visibleOrders = (wave.orders || []).filter((o: any) => o.status !== 'SHIPPED');
              const allVisibleOrdersComplete = visibleOrders.length === 0 || visibleOrders.every((o: any) => 
                o.status === 'PROCESSING' || o.status === 'DELIVERED'
              );
              
              // Eğer görünen sipariş yoksa veya tüm görünen siparişler tamamlandıysa
              if (allVisibleOrdersComplete) {
                // Auto-complete wave
                await api.completePicking(activeWaveId);
                toast.success('Tüm siparişler tamamlandı, dalga otomatik tamamlandı!');
                queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
                if (onClearActiveWave) {
                  onClearActiveWave();
                }
              }
            }
          } catch (error: any) {
            console.error('Wave completion check error:', error);
          }
        }, 500);
      }
      
      toast.success('Sipariş hazırlandı ve stoklar düşürüldü!');
      setSelectedOrder(null);
      setScannedItems([]);
      setIsCompleteModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Sipariş tamamlanamadı');
    },
  });

  // Play sound effect
  const playSound = (type: 'success' | 'error' | 'warning') => {
    if (!soundEnabled) return;
    
    const frequencies = { success: 800, error: 300, warning: 500 };
    const durations = { success: 100, error: 200, warning: 150 };
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequencies[type];
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + durations[type] / 1000);
    } catch (e) {
      // Audio not supported
    }
  };

  // Track if we've already tried to fetch order details to prevent infinite loops
  const [fetchingOrderDetails, setFetchingOrderDetails] = useState<Set<string>>(new Set());

  // Initialize scanned items when order is selected
  useEffect(() => {
    if (!selectedOrder) {
      setScannedItems([]);
      return;
    }
    
    // Check if items exist and is an array
    if (!selectedOrder.items || !Array.isArray(selectedOrder.items) || selectedOrder.items.length === 0) {
      console.warn('⚠️ [OrderPicking] Sipariş items boş veya geçersiz:', {
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber,
        items: selectedOrder.items,
        itemsType: typeof selectedOrder.items,
        itemsIsArray: Array.isArray(selectedOrder.items),
        fullOrder: selectedOrder,
      });
      
      // Only fetch once per order to prevent infinite loops
      if (fetchingOrderDetails.has(selectedOrder.id)) {
        console.log(`⏭️ [OrderPicking] Bu sipariş için zaten detay çekme denemesi yapıldı, atlanıyor`);
        setScannedItems([]);
        return;
      }
      
      // Try to fetch order details again if items are missing
      const fetchOrderDetails = async () => {
        setFetchingOrderDetails(prev => new Set(prev).add(selectedOrder.id));
        try {
          console.log(`🔄 [OrderPicking] Items eksik, sipariş detayları tekrar çekiliyor...`);
          const fullOrderResponse = await api.getOrder(selectedOrder.id);
          console.log(`✅ [OrderPicking] Sipariş detayları çekildi:`, {
            response: fullOrderResponse,
            hasData: !!fullOrderResponse.data,
            orderId: fullOrderResponse.data?.id,
            itemsCount: fullOrderResponse.data?.items?.length || 0,
            items: fullOrderResponse.data?.items,
          });
          
          if (fullOrderResponse.data && Array.isArray(fullOrderResponse.data.items) && fullOrderResponse.data.items.length > 0) {
            setFetchingOrderDetails(prev => {
              const newSet = new Set(prev);
              newSet.delete(selectedOrder.id);
              return newSet;
            });
            setSelectedOrder(fullOrderResponse.data);
            return; // Will trigger useEffect again with new order data
          } else {
            console.error('❌ [OrderPicking] Sipariş detaylarında da items yok!');
            setScannedItems([]);
          }
        } catch (error) {
          console.error('❌ [OrderPicking] Sipariş detayları çekilemedi:', error);
          setScannedItems([]);
        } finally {
          setFetchingOrderDetails(prev => {
            const newSet = new Set(prev);
            newSet.delete(selectedOrder.id);
            return newSet;
          });
        }
      };
      
      fetchOrderDetails();
      return;
    }
    
    // Clear fetching flag if items are present
    if (fetchingOrderDetails.has(selectedOrder.id)) {
      setFetchingOrderDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedOrder.id);
        return newSet;
      });
    }
    
    // Debug: Log raw order data from backend
    console.log('🔍 [DEBUG] Raw order data from backend:', {
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      itemsCount: selectedOrder.items.length,
      items: selectedOrder.items.map((item: any) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        productId: item.productId,
        product: item.product,
        variant: item.variant,
      })),
    });
    
    // ✅ FIX: Fetch missing product information and match by SKU if productId is null
    // Use IIFE (Immediately Invoked Function Expression) to handle async in useEffect
    (async () => {
      // Items that need product fetching: have productId but no product object
      const itemsWithMissingProducts = selectedOrder.items.filter(
        (item: any) => item.productId && !item.product
      );
      
      // ✅ FIX: Items with null productId but have SKU - match by SKU
      const itemsWithNullProductId = selectedOrder.items.filter(
        (item: any) => !item.productId && item.sku
      );
      
      let orderItems = selectedOrder.items;
      
      // Fetch products by productId (if productId exists but product object is missing)
      if (itemsWithMissingProducts.length > 0) {
        console.log(`🔄 ${itemsWithMissingProducts.length} item için product bilgisi eksik, çekiliyor...`);
        
        try {
          const productPromises = itemsWithMissingProducts.map(async (item: any) => {
            try {
              const productData = await api.getProduct(item.productId);
              return { itemId: item.id, product: productData.data };
            } catch (error) {
              console.error(`❌ Product çekilemedi (${item.productId}):`, error);
              return { itemId: item.id, product: null };
            }
          });
          
          const productResults = await Promise.all(productPromises);
          
          // Update order items with fetched products
          orderItems = orderItems.map((item: any) => {
            const productResult = productResults.find(r => r.itemId === item.id);
            if (productResult && productResult.product) {
              return { ...item, product: productResult.product };
            }
            return item;
          });
          
          console.log('✅ Product bilgileri güncellendi');
        } catch (error) {
          console.error('❌ Product bilgileri çekilirken hata:', error);
        }
      }

      // ✅ FIX: Match products by SKU for items with null productId
      if (itemsWithNullProductId.length > 0) {
        console.log(`🔄 ${itemsWithNullProductId.length} item için SKU ile product eşleştiriliyor...`);
        
        orderItems = orderItems.map((item: any) => {
          // If productId is null but SKU exists, try to match by SKU
          if (!item.productId && item.sku) {
            const matchedProduct = findProductBySku(item.sku);
            if (matchedProduct) {
              console.log(`✅ SKU ile product bulundu: ${item.sku} → ${matchedProduct.id}`);
              return { ...item, product: matchedProduct, productId: matchedProduct.id };
            } else {
              console.warn(`⚠️ SKU ile product bulunamadı: ${item.sku}`);
            }
          }
          return item;
        });
      }
      
      // Initialize scanned items with order items (with or without fetched products)
      const items: ScannedItem[] = orderItems.map((item: any) => {
        // ✅ FIX: If product is still missing, try SKU match one more time
        if (!item.product && item.sku) {
          const matchedProduct = findProductBySku(item.sku);
          if (matchedProduct) {
            item.product = matchedProduct;
            item.productId = matchedProduct.id;
          }
        }
        
        // Priority: GTIN > variant barcode > product barcode (SKU'lar hariç)
        const barcode = 
          (item.product?.gtin?.trim()) || 
          (item.variant?.barcode?.trim()) || 
          (item.product?.barcode?.trim());
        
        const finalBarcode = barcode || '';
        
        // Tüm olası barkodları topla (sadece gerçek barkod alanları - SKU'lar hariç)
        const allBarcodes: string[] = [];
        
        // GTIN ekle (öncelikli - EAN/UPC - WooCommerce _global_unique_id)
        const gtin = item.product?.gtin?.trim();
        if (gtin && gtin.length > 0) {
          allBarcodes.push(gtin);
        }
        // Variant barcode
        const variantBarcode = item.variant?.barcode?.trim();
        if (variantBarcode && variantBarcode.length > 0) {
          allBarcodes.push(variantBarcode);
        }
        // Product barcode (önemli: boş string kontrolü)
        const productBarcode = item.product?.barcode?.trim();
        if (productBarcode && productBarcode.length > 0) {
          allBarcodes.push(productBarcode);
        }
        // Item barcode (entegrasyondan gelen)
        const itemBarcode = item.barcode?.trim();
        if (itemBarcode && itemBarcode.length > 0) {
          allBarcodes.push(itemBarcode);
        }
        // SKU'lar barkod olarak kabul edilmez - sadece gerçek barkod alanlarına bakılır
        
        // Tekrarları kaldır
        const uniqueBarcodes = Array.from(new Set(allBarcodes));
        
        // Get primary location - prioritize variant location, then product location
        const primaryLocation = 
          (item.variant?.locationAssignments?.[0]?.location) ||
          (item.product?.locationAssignments?.[0]?.location) ||
          null;
        
        // Debug log - show full item structure
        console.group(`📦 [Order Item] ${item.name}`);
        console.log('Item SKU:', item.sku);
        console.log('Variant:', item.variant ? {
          id: item.variant.id,
          sku: item.variant.sku,
          barcode: item.variant.barcode || '(yok)',
          location: item.variant.locationAssignments?.[0]?.location?.code || '(yok)',
        } : '(yok)');
        console.log('Product:', {
          id: item.product?.id,
          sku: item.product?.sku || '',
          barcode: item.product?.barcode || '(yok)',
          barcodeRaw: item.product?.barcode, // Raw value (null, empty string, or actual barcode)
          gtin: item.product?.gtin || '(yok)',
          gtinRaw: item.product?.gtin, // Raw value
          location: item.product?.locationAssignments?.[0]?.location?.code || '(yok)',
        });
        console.log('Primary Location:', primaryLocation?.code || '(yok)');
        console.log('Final Barcode:', finalBarcode);
        console.log('All Barcodes:', uniqueBarcodes);
        console.log('All Barcodes (detailed):', {
          gtin: gtin || '(yok)',
          variantBarcode: variantBarcode || '(yok)',
          productBarcode: productBarcode || '(yok)',
          itemBarcode: itemBarcode || '(yok)',
          // SKU'lar barkod değil, gösterilmiyor
        });
        console.groupEnd();
        
        return {
          orderItemId: item.id,
          sku: item.sku,
          barcode: finalBarcode,
          allBarcodes: uniqueBarcodes,
          name: item.name,
          requiredQty: item.quantity,
          scannedQty: 0,
          isComplete: false,
          locationId: primaryLocation?.id || null,
          locationCode: primaryLocation?.code || null,
        };
      });
      
      console.log(`✅ [OrderPicking] ${items.length} scanned item oluşturuldu:`, items);
      setScannedItems(items);
      
      // Focus barcode input if in manual mode
      if (!isCameraMode) {
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }
    })();
  }, [selectedOrder, isCameraMode, products]); // ✅ FIX: Include products for SKU matching

  // Start camera scanner
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    
    try {
      setCameraError(null);
      
      // Create scanner instance
      html5QrcodeRef.current = new Html5Qrcode("barcode-scanner", {
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
        { facingMode: "environment" }, // Back camera
        {
          fps: 10,
          qrbox: { width: 300, height: 150 },
          aspectRatio: 1.777778,
        },
        (decodedText) => {
          handleBarcodeScan(decodedText);
        },
        () => {
          // QR code scanning failed (ignore)
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
      // Wait for DOM to update, then start camera
      setTimeout(() => startCamera(), 100);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Scan item mutation - sadece doğrulama yapar, stok düşürmez
  const scanItemMutation = useMutation({
    mutationFn: ({ barcode, locationId }: { barcode: string; locationId?: string }) =>
      api.scanOrderItem(selectedOrder!.id, { barcode, locationId }),
    onSuccess: (data) => {
      const item = data.data?.orderItem;
      if (item) {
        // Find and update the scanned item
        const itemIndex = scannedItems.findIndex(
          (si) => si.orderItemId === item.id || si.sku === item.sku
        );
        
        if (itemIndex !== -1) {
          const updatedItem = scannedItems[itemIndex];
          const newScannedItems = [...scannedItems];
          
          // Update location info from response if available
          const locationInfo = data.data?.stock?.locationId 
            ? { locationId: data.data.stock.locationId }
            : {};
          
          newScannedItems[itemIndex] = {
            ...updatedItem,
            scannedQty: updatedItem.scannedQty + 1,
            isComplete: updatedItem.scannedQty + 1 >= updatedItem.requiredQty,
            ...locationInfo,
          };
          setScannedItems(newScannedItems);
          
          playSound('success');
          setLastScanStatus('success');
          const locationText = locationInfo.locationId ? ' (Lokasyon: ' + locationInfo.locationId + ')' : '';
          toast.success(`✓ ${item.name} doğrulandı (${newScannedItems[itemIndex].scannedQty}/${newScannedItems[itemIndex].requiredQty})${locationText}`);
        }
      }
      setTimeout(() => setLastScanStatus(null), 1500);
    },
    onError: (error: any) => {
      playSound('error');
      setLastScanStatus('error');
      toast.error(error.response?.data?.message || 'Barkod okutma hatası');
      setTimeout(() => setLastScanStatus(null), 1500);
    },
  });

  // Wave-based scan mutation - dalga bazlı toplama
  const scanWaveBarcodeMutation = useMutation({
    mutationFn: ({ waveId, barcode }: { waveId: string; barcode: string }) =>
      api.scanPickingWaveBarcode(waveId, barcode),
    onSuccess: async (data) => {
      toast.success(data.message || 'Barkod okutuldu');
      setBarcodeInput('');
      
      // Refresh wave data to show updated progress
      if (activeWaveId) {
        queryClient.invalidateQueries({ queryKey: ['picking-wave', activeWaveId] });
        queryClient.invalidateQueries({ queryKey: ['pending-orders', activeWaveId] });
      }
      
      playSound('success');
      setLastScanStatus('success');
      setTimeout(() => setLastScanStatus(null), 1500);
      
      // Check if all orders in wave are complete
      if (activeWaveId) {
        const waveData = await api.getPickingWave(activeWaveId);
        const allOrdersComplete = waveData.data?.orders?.every((o: any) => 
          o.status === 'PROCESSING' || o.status === 'SHIPPED'
        );
        if (allOrdersComplete) {
          toast.success('Tüm siparişler tamamlandı!');
        }
      }
    },
    onError: (error: any) => {
      playSound('error');
      setLastScanStatus('error');
      toast.error(error.response?.data?.message || 'Barkod okutma hatası');
      setTimeout(() => setLastScanStatus(null), 1500);
    },
  });

  // Handle barcode scan (from camera or manual input)
  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode.trim()) return;

    const normalizedBarcode = barcode.trim();

    // Aktif dalga varsa dalga bazlı okutma yap
    if (activeWaveId) {
      scanWaveBarcodeMutation.mutate({
        waveId: activeWaveId,
        barcode: normalizedBarcode,
      });
      setBarcodeInput('');
      if (!isCameraMode) {
        barcodeInputRef.current?.focus();
      }
      return;
    }

    // Aktif dalga yoksa normal sipariş bazlı okutma
    if (!selectedOrder) {
      toast.error('Lütfen önce bir sipariş seçin');
      return;
    }

    const normalizedBarcodeUpper = normalizedBarcode.toUpperCase();
    
    // Önce frontend'de hızlı kontrol yap (opsiyonel - UX için)
    const itemIndex = scannedItems.findIndex((item) => {
      // Tüm olası barkodları kontrol et (sadece gerçek barkod alanları - GTIN, barcode)
      // SKU'lar barkod olarak kabul edilmez
      const possibleBarcodes = item.allBarcodes || [
        item.barcode,
        // SKU'ya bakma - sadece gerçek barkod alanlarına bak
      ].filter(Boolean).map(b => (b || '').trim()).filter(b => b.length > 0);
      
      // Check if normalized barcode matches any of the possible barcodes
      // Try exact match first
      if (possibleBarcodes.some(b => b === normalizedBarcode)) {
        return true;
      }
      
      // Try case-insensitive match
      if (possibleBarcodes.some(b => b.toUpperCase() === normalizedBarcodeUpper)) {
        return true;
      }
      
      return false;
    });

    // Frontend'de eşleşme bulunduysa, miktar kontrolü yap
    if (itemIndex !== -1) {
      const item = scannedItems[itemIndex];
      
      if (item.scannedQty >= item.requiredQty) {
        // Already complete
        playSound('warning');
        setLastScanStatus('warning');
        toast.error(`${item.name} zaten tamamlandı!`);
        setTimeout(() => setLastScanStatus(null), 1500);
        setBarcodeInput('');
        if (!isCameraMode) {
          barcodeInputRef.current?.focus();
        }
        return;
      }
    }

    // Her durumda backend'e gönder - backend daha kapsamlı arama yapar
    // Backend tüm olası barkodları kontrol eder (GTIN, barcode, variant barcode - SKU hariç)
    // Bu sayede frontend'de eksik olan product bilgileri backend'de tam olabilir
    console.log(`🔍 Barkod backend'e gönderiliyor: ${normalizedBarcode}`);
    scanItemMutation.mutate({ 
      barcode: normalizedBarcode,
      // locationId can be added later if needed
    });

    setBarcodeInput('');
    if (!isCameraMode) {
      barcodeInputRef.current?.focus();
    }
  };

  // Handle key press (Enter to submit barcode)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeScan(barcodeInput);
    }
  };

  // Check if all items are scanned
  const isOrderComplete = scannedItems.length > 0 && scannedItems.every((item) => item.isComplete);
  const totalItems = scannedItems.reduce((sum, item) => sum + item.requiredQty, 0);
  const scannedTotal = scannedItems.reduce((sum, item) => sum + item.scannedQty, 0);

  // Complete order
  const handleCompleteOrder = () => {
    if (!selectedOrder || !isOrderComplete) return;
    
    updateStatusMutation.mutate({
      id: selectedOrder.id,
      data: { status: 'PROCESSING' },
    });
  };

  // Filter out SHIPPED orders - paketlenmiş siparişler dalgada görünmemeli
  const allOrders = (ordersData?.data || []).filter((order: Order) => order.status !== 'SHIPPED');
  
  // ✅ ARAMA/FİLTRELEME: Sipariş numarası ve müşteri adına göre filtrele
  const orders = allOrders.filter((order: Order) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      order.orderNumber.toLowerCase().includes(query) ||
      order.customerName.toLowerCase().includes(query)
    );
  });
  
  // ✅ İSTATİSTİKLER: Sipariş ve tarama istatistiklerini hesapla
  const stats = {
    totalOrders: orders.length,
    completedOrders: orders.filter((o: Order) => 
      o.status === 'PROCESSING' || o.status === 'SHIPPED' || o.status === 'DELIVERED'
    ).length,
    totalItems: scannedItems.reduce((sum, item) => sum + item.requiredQty, 0),
    scannedItems: scannedItems.reduce((sum, item) => sum + item.scannedQty, 0),
  };
  
  const progressPercentage = stats.totalItems > 0 
    ? Math.round((stats.scannedItems / stats.totalItems) * 100) 
    : 0;
  
  // Debug: Log orders data structure
  useEffect(() => {
    if (ordersData) {
      const firstOrder = Array.isArray(ordersData.data) && ordersData.data.length > 0 ? ordersData.data[0] : null;
      console.log('📦 [DEBUG] Orders Data Structure:', {
        hasData: !!ordersData.data,
        dataType: typeof ordersData.data,
        isArray: Array.isArray(ordersData.data),
        ordersCount: Array.isArray(ordersData.data) ? ordersData.data.length : 0,
        firstOrder: firstOrder ? {
          id: firstOrder.id,
          orderNumber: firstOrder.orderNumber,
          hasItems: !!firstOrder.items,
          itemsType: typeof firstOrder.items,
          itemsIsArray: Array.isArray(firstOrder.items),
          itemsCount: Array.isArray(firstOrder.items) ? firstOrder.items.length : 0,
          items: firstOrder.items,
          // Full first order for deep inspection
          fullFirstOrder: firstOrder,
        } : null,
        fullResponse: ordersData,
      });
      
      // Also log all orders' items count
      if (Array.isArray(ordersData.data)) {
        const ordersWithItems = ordersData.data.filter((o: any) => o.items && Array.isArray(o.items) && o.items.length > 0);
        const ordersWithoutItems = ordersData.data.filter((o: any) => !o.items || !Array.isArray(o.items) || o.items.length === 0);
        console.log('📊 [DEBUG] Orders Items Summary:', {
          totalOrders: ordersData.data.length,
          ordersWithItems: ordersWithItems.length,
          ordersWithoutItems: ordersWithoutItems.length,
          ordersWithoutItemsList: ordersWithoutItems.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            hasItems: !!o.items,
            itemsType: typeof o.items,
            itemsIsArray: Array.isArray(o.items),
            itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          })),
        });
      }
    }
  }, [ordersData]);

  return (
    <div className="space-y-6">
      {/* Active Wave Info */}
      {activeWaveId && activeWaveData?.data && (
        <Card className="bg-primary-50 border-primary-200">
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Waves className="w-6 h-6 text-primary-600" />
                <div>
                  <h3 className="font-semibold text-primary-900">
                    Aktif Dalga: {activeWaveData.data.code}
                  </h3>
                  <p className="text-sm text-primary-700">
                    {orders.length} aktif sipariş
                    {activeWaveData.data.orders?.length === 0 && (
                      <span className="ml-2 text-warning-600 font-medium">
                        • Tüm siparişler paketlendi
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {onClearActiveWave && (
                <Button variant="secondary" size="sm" onClick={onClearActiveWave}>
                  Moddan Çık
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ✅ İSTATİSTİKLER KARTLARI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary-50 border-primary-200">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary-700 mb-1">Toplam Sipariş</p>
                <p className="text-2xl font-bold text-primary-600">{stats.totalOrders}</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-primary-400" />
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-success-50 border-success-200">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-success-700 mb-1">Tamamlanan</p>
                <p className="text-2xl font-bold text-success-600">{stats.completedOrders}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-success-400" />
            </div>
          </CardBody>
        </Card>
        
        <Card className="bg-warning-50 border-warning-200">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-warning-700 mb-1">İlerleme</p>
                <p className="text-2xl font-bold text-warning-600">{progressPercentage}%</p>
                {stats.totalItems > 0 && (
                  <p className="text-xs text-warning-600 mt-1">
                    {stats.scannedItems} / {stats.totalItems} ürün
                  </p>
                )}
              </div>
              <Package className="w-8 h-8 text-warning-400" />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant={soundEnabled ? 'secondary' : 'ghost'}
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders List */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <div className="card-header">
              <h2 className="font-semibold text-secondary-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                {activeWaveId ? (
                  <>
                    Dalga Siparişleri ({orders.length})
                    <Badge variant="primary" className="ml-2 text-xs">
                      {activeWaveData?.data?.code}
                    </Badge>
                  </>
                ) : (
                  `Bekleyen Siparişler (${orders.length})`
                )}
              </h2>
            </div>
            {/* ✅ ARAMA INPUT: Sipariş arama */}
            <div className="px-4 pt-4 pb-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Sipariş no veya müşteri adı ile ara..."
                leftIcon={<Search className="w-4 h-4" />}
                className="w-full"
              />
            </div>
            <CardBody className="p-0 max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : orders.length > 0 ? (
                <div className="divide-y divide-secondary-100">
                  {orders.map((order: Order) => (
                    <button
                      key={order.id}
                      onClick={async () => {
                        // Stop camera when changing orders
                        if (isCameraActive) {
                          stopCamera();
                          setIsCameraMode(false);
                        }
                        
                        // Debug: Log order before selection
                        console.log('🔍 [DEBUG] Order selected:', {
                          orderId: order.id,
                          orderNumber: order.orderNumber,
                          hasItems: !!order.items,
                          itemsType: typeof order.items,
                          itemsIsArray: Array.isArray(order.items),
                          itemsCount: Array.isArray(order.items) ? order.items.length : 0,
                          items: order.items,
                          fullOrder: order,
                        });
                        
                        // If order doesn't have items, fetch full order details
                        if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
                          try {
                            console.log(`🔄 Sipariş ${order.orderNumber} için items eksik, detaylar çekiliyor...`);
                            const fullOrderResponse = await api.getOrder(order.id);
                            console.log(`✅ Sipariş detayları çekildi:`, {
                              response: fullOrderResponse,
                              hasData: !!fullOrderResponse.data,
                              orderId: fullOrderResponse.data?.id,
                              itemsCount: fullOrderResponse.data?.items?.length || 0,
                              items: fullOrderResponse.data?.items,
                            });
                            setSelectedOrder(fullOrderResponse.data || order);
                          } catch (error) {
                            console.error('❌ Sipariş detayları çekilemedi:', error);
                            toast.error('Sipariş detayları yüklenemedi');
                            setSelectedOrder(order);
                          }
                        } else {
                          console.log(`✅ Sipariş ${order.orderNumber} items mevcut, direkt kullanılıyor`);
                          setSelectedOrder(order);
                        }
                      }}
                      className={cn(
                        'w-full p-4 text-left hover:bg-secondary-50 transition-colors',
                        selectedOrder?.id === order.id && 'bg-primary-50 border-l-4 border-primary-500'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-secondary-900">
                          #{order.orderNumber}
                        </span>
                        <Badge variant="warning">Bekliyor</Badge>
                      </div>
                      <p className="text-sm text-secondary-600 mb-1">
                        {order.customerName}
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-secondary-500">
                          {order.items?.length || 0} ürün
                        </span>
                        <span className="font-medium text-secondary-700">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state py-12">
                  {activeWaveId ? (
                    <>
                      <CheckCircle className="w-12 h-12 text-success-500 mb-3" />
                      <p className="text-secondary-600 font-medium mb-1">
                        Tüm siparişler paketlendi
                      </p>
                      <p className="text-sm text-secondary-500">
                        Bu dalgadaki tüm siparişler paketlenmiş durumda
                      </p>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-12 h-12 text-success-500 mb-3" />
                      <p className="text-secondary-600">Bekleyen sipariş yok</p>
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Scanning Area */}
        <div className="lg:col-span-2">
          {(selectedOrder || activeWaveId) ? (
            <div className="space-y-4">
              {/* Mode Toggle */}
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

              {/* Barcode Input / Camera */}
              <Card className={cn(
                'border-2 transition-colors',
                lastScanStatus === 'success' && 'border-success-500 bg-success-50',
                lastScanStatus === 'error' && 'border-danger-500 bg-danger-50',
                lastScanStatus === 'warning' && 'border-warning-500 bg-warning-50',
                !lastScanStatus && 'border-secondary-200'
              )}>
                <CardBody className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={cn(
                      'w-16 h-16 rounded-2xl flex items-center justify-center',
                      lastScanStatus === 'success' && 'bg-success-100',
                      lastScanStatus === 'error' && 'bg-danger-100',
                      lastScanStatus === 'warning' && 'bg-warning-100',
                      !lastScanStatus && 'bg-primary-100'
                    )}>
                      {isCameraMode ? (
                        <Camera className={cn(
                          'w-8 h-8',
                          lastScanStatus === 'success' && 'text-success-600',
                          lastScanStatus === 'error' && 'text-danger-600',
                          lastScanStatus === 'warning' && 'text-warning-600',
                          !lastScanStatus && 'text-primary-600'
                        )} />
                      ) : (
                        <ScanLine className={cn(
                          'w-8 h-8',
                          lastScanStatus === 'success' && 'text-success-600',
                          lastScanStatus === 'error' && 'text-danger-600',
                          lastScanStatus === 'warning' && 'text-warning-600',
                          !lastScanStatus && 'text-primary-600'
                        )} />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-secondary-900 mb-1">
                        {isCameraMode ? 'EAN Barkodu Kameraya Gösterin' : 'Barkod Okutun'}
                      </h3>
                      <p className="text-sm text-secondary-500">
                        {activeWaveId ? (
                          <>Dalga {activeWaveData?.data?.code} için ürün barkodlarını {isCameraMode ? 'tarayın' : 'okutun'}</>
                        ) : (
                          <>Sipariş #{selectedOrder?.orderNumber} için ürün barkodlarını {isCameraMode ? 'tarayın' : 'okutun'}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {isCameraMode ? (
                    <div className="space-y-4">
                      {/* Camera Scanner */}
                      <div 
                        id="barcode-scanner" 
                        ref={scannerContainerRef}
                        className="w-full rounded-xl overflow-hidden bg-black"
                        style={{ minHeight: '300px' }}
                      />
                      
                      {cameraError && (
                        <div className="flex items-center gap-2 p-4 bg-danger-50 rounded-xl text-danger-700">
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

                      <p className="text-center text-sm text-secondary-500">
                        EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 desteklenir
                      </p>
                    </div>
                  ) : (
                    <Input
                      ref={barcodeInputRef}
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="EAN barkod okutun veya manuel girin..."
                      className="text-xl font-mono text-center"
                      leftIcon={<Search className="w-5 h-5" />}
                      autoFocus
                    />
                  )}

                  {/* Progress - Only show for selected order */}
                  {selectedOrder && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-secondary-600">İlerleme</span>
                        <span className="font-medium text-secondary-900">
                          {scannedTotal} / {totalItems} ürün
                        </span>
                      </div>
                      <div className="h-3 bg-secondary-100 rounded-full overflow-hidden relative">
                        <div
                          className={cn(
                            'h-full transition-all duration-500 ease-out',
                            isOrderComplete 
                              ? 'bg-success-500 shadow-sm shadow-success-200' 
                              : 'bg-primary-500 shadow-sm shadow-primary-200'
                          )}
                          style={{ 
                            width: `${totalItems > 0 ? (scannedTotal / totalItems) * 100 : 0}%`,
                            transition: 'width 0.5s ease-out, background-color 0.3s ease-out'
                          }}
                        />
                        {/* ✅ ANİMASYON: İlerleme çubuğu için shimmer efekti */}
                        {!isOrderComplete && scannedTotal > 0 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Wave Progress - Show for wave mode */}
                  {activeWaveId && !selectedOrder && activeWaveData?.data && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-secondary-600">Dalga İlerlemesi</span>
                        <span className="font-medium text-secondary-900">
                          {orders.length === 0 ? (
                            <span className="text-success-600">Tüm siparişler paketlendi</span>
                          ) : (
                            <>
                              {orders.filter((o: any) => o.status === 'PROCESSING' || o.status === 'DELIVERED').length} / {orders.length} sipariş
                            </>
                          )}
                        </span>
                      </div>
                      <div className="h-3 bg-secondary-100 rounded-full overflow-hidden relative">
                        <div
                          className={cn(
                            "h-full transition-all duration-500 ease-out",
                            orders.length === 0 
                              ? "bg-success-500 shadow-sm shadow-success-200" 
                              : "bg-primary-500 shadow-sm shadow-primary-200"
                          )}
                          style={{ 
                            width: `${orders.length > 0 
                              ? ((orders.filter((o: any) => 
                                  o.status === 'PROCESSING' || o.status === 'DELIVERED'
                                ).length || 0) / orders.length) * 100 
                              : 100}%`,
                            transition: 'width 0.5s ease-out, background-color 0.3s ease-out'
                          }}
                        />
                        {/* ✅ ANİMASYON: Dalga ilerleme çubuğu için shimmer efekti */}
                        {orders.length > 0 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                        )}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Items List - Only show for selected order */}
              {selectedOrder && (
              <Card>
                <div className="card-header flex items-center justify-between">
                  <h3 className="font-semibold text-secondary-900">
                    Sipariş Ürünleri
                  </h3>
                  {isOrderComplete && (
                    <Badge variant="success">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Tamamlandı
                    </Badge>
                  )}
                </div>
                <CardBody className="p-0">
                  {scannedItems.length === 0 ? (
                    <div className="p-8 text-center">
                      <AlertTriangle className="w-12 h-12 text-warning-500 mx-auto mb-3" />
                      <p className="text-secondary-600 font-medium mb-1">
                        Sipariş ürünleri yüklenemedi
                      </p>
                      <p className="text-sm text-secondary-500 mb-4">
                        Siparişte ürün bulunamadı veya ürünler henüz yüklenmedi.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          if (selectedOrder) {
                            try {
                              const fullOrder = await api.getOrder(selectedOrder.id);
                              setSelectedOrder(fullOrder.data || selectedOrder);
                              toast.success('Sipariş detayları yenilendi');
                            } catch (error) {
                              toast.error('Sipariş detayları yüklenemedi');
                            }
                          }
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Yenile
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-secondary-100">
                      {scannedItems.map((item) => (
                      <div
                        key={item.orderItemId}
                        className={cn(
                          'flex items-center justify-between p-4 transition-all duration-300',
                          item.isComplete 
                            ? 'bg-success-50 border-l-4 border-success-500' 
                            : item.scannedQty > 0
                            ? 'bg-primary-50 border-l-4 border-primary-300'
                            : 'border-l-4 border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300',
                            item.isComplete 
                              ? 'bg-success-100 ring-2 ring-success-300 ring-offset-1' 
                              : item.scannedQty > 0
                              ? 'bg-primary-100 ring-2 ring-primary-300 ring-offset-1'
                              : 'bg-secondary-100'
                          )}>
                            {item.isComplete ? (
                              <CheckCircle className="w-5 h-5 text-success-600 animate-pulse" />
                            ) : (
                              <Package className={cn(
                                'w-5 h-5 transition-colors',
                                item.scannedQty > 0 ? 'text-primary-500' : 'text-secondary-400'
                              )} />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start gap-2 mb-1">
                              <p className={cn(
                                'font-medium flex-1',
                                item.isComplete ? 'text-success-700' : 'text-secondary-900'
                              )}>
                                {item.name}
                              </p>
                              {item.locationCode && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 border border-primary-200 rounded-lg flex-shrink-0">
                                  <MapPin className="w-3.5 h-3.5 text-primary-600" />
                                  <span className="text-xs font-semibold text-primary-700">
                                    {item.locationCode}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-secondary-500">
                              <span className="font-mono">{item.sku}</span>
                              {item.barcode !== item.sku && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-xs bg-secondary-100 px-1.5 py-0.5 rounded">
                                    EAN: {item.barcode}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'text-xl font-bold',
                            item.isComplete ? 'text-success-600' : 
                            item.scannedQty > 0 ? 'text-primary-600' : 'text-secondary-400'
                          )}>
                            {item.scannedQty} / {item.requiredQty}
                          </p>
                          <p className="text-sm text-secondary-500">
                            {item.isComplete ? 'Tamam' : `${item.requiredQty - item.scannedQty} kaldı`}
                          </p>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </CardBody>
              </Card>
              )}

              {/* Action Buttons - Only show for selected order */}
              {selectedOrder && (
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    stopCamera();
                    setIsCameraMode(false);
                    setSelectedOrder(null);
                    setScannedItems([]);
                  }}
                >
                  İptal
                </Button>
                <Button
                  className="flex-1"
                  disabled={!isOrderComplete}
                  onClick={() => setIsCompleteModalOpen(true)}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  {isOrderComplete ? 'Siparişi Tamamla' : 'Tüm Ürünleri Okutun'}
                </Button>
              </div>
              )}

              {selectedOrder && !isOrderComplete && (
                <div className="flex items-center gap-2 p-4 bg-warning-50 rounded-xl text-warning-700">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-sm">
                    Siparişi tamamlamak için tüm ürünleri okutmanız gerekiyor
                  </span>
                </div>
              )}

              {/* Wave Mode Info */}
              {activeWaveId && !selectedOrder && (
                <Card className="bg-primary-50 border-primary-200">
                  <CardBody>
                    <div className="flex items-start gap-3">
                      <Waves className="w-5 h-5 text-primary-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-primary-900 mb-1">
                          Dalga Modu Aktif
                        </h4>
                        <p className="text-sm text-primary-700 mb-3">
                          Barkod okutarak dalgadaki tüm siparişlerin ürünlerini toplayabilirsiniz. 
                          Sipariş seçmenize gerek yok, sistem otomatik olarak hangi siparişe ait olduğunu belirler.
                        </p>
                        <p className="text-xs text-primary-600">
                          Tüm siparişler tamamlandığında dalga otomatik olarak tamamlanacaktır.
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardBody>
                <div className="text-center py-12">
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <ScanLine className="w-16 h-16 text-secondary-300" />
                    <Camera className="w-16 h-16 text-secondary-300" />
                  </div>
                  <h3 className="text-xl font-semibold text-secondary-900 mb-2">
                    Sipariş Seçin
                  </h3>
                  <p className="text-secondary-500 mb-4">
                    Soldaki listeden bir sipariş seçerek barkod okutmaya başlayın
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm text-secondary-400">
                    <Camera className="w-4 h-4" />
                    <span>Kamera ile EAN barkod okuma desteklenir</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Complete Order Modal */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Siparişi Tamamla"
      >
        <div className="space-y-4">
          <div className="p-4 bg-success-50 rounded-xl">
            <div className="flex items-center gap-3 text-success-700">
              <CheckCircle className="w-8 h-8" />
              <div>
                <p className="font-semibold">Tüm ürünler hazır!</p>
                <p className="text-sm">Sipariş kargoya verilmeye hazır</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-secondary-50 rounded-xl">
            <p className="text-sm text-secondary-600 mb-2">Sipariş Özeti</p>
            <p className="font-semibold">#{selectedOrder?.orderNumber}</p>
            <p className="text-sm text-secondary-500">{selectedOrder?.customerName}</p>
            <p className="text-lg font-bold text-secondary-900 mt-2">
              {formatCurrency(selectedOrder?.total || 0)}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsCompleteModalOpen(false)}
            >
              İptal
            </Button>
            <Button
              variant="success"
              className="flex-1"
              onClick={handleCompleteOrder}
              isLoading={updateStatusMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Onayla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function OrderPicking() {
  const [activeTab, setActiveTab] = useState<'picking' | 'waves'>('waves'); // ✅ Varsayılan tab: Toplama Dalgaları
  const [activeWaveId, setActiveWaveId] = useState<string | null>(null);

  const handleWaveStarted = (waveId: string) => {
    setActiveWaveId(waveId);
    setActiveTab('picking');
    toast.success('Dalga başlatıldı, hazırlamaya geçiliyor...');
  };

  const handleClearActiveWave = () => {
    setActiveWaveId(null);
    toast.success('Dalga modundan çıkıldı');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <ScanLine className="w-8 h-8 text-primary-500" />
            Sipariş Hazırlama
          </h1>
          <p className="text-secondary-500">Kamera veya barkod okuyucu ile siparişleri hazırlayın</p>
        </div>
        {activeWaveId && (
          <div className="flex items-center gap-2">
            <Badge variant="primary" className="text-sm">
              <Waves className="w-3 h-3 mr-1" />
              Dalga Modu Aktif
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearActiveWave}
            >
              Moddan Çık
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="flex gap-4" aria-label="Tabs">
          {/* ✅ TAB SIRASI DEĞİŞTİRİLDİ: Toplama Dalgaları önce */}
          <button
            onClick={() => setActiveTab('waves')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'waves'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <Waves className="w-4 h-4" />
            Toplama Dalgaları
          </button>
          <button
            onClick={() => setActiveTab('picking')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'picking'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <ScanLine className="w-4 h-4" />
            Sipariş Hazırlama
            {activeWaveId && (
              <Badge variant="primary" className="ml-1 text-xs">
                Dalga
              </Badge>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {/* ✅ TAB SIRASI DEĞİŞTİRİLDİ: Toplama Dalgaları önce */}
      {activeTab === 'waves' ? (
        <PickingWavesTab onWaveStarted={handleWaveStarted} />
      ) : (
        <OrderPickingTab 
          activeWaveId={activeWaveId}
          onClearActiveWave={handleClearActiveWave}
        />
      )}
    </div>
  );
}
