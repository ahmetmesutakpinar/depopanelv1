import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  Package,
  Search,
  Eye,
  List,
  ScanLine,
  Camera,
  Keyboard,
  ArrowRight,
  ArrowLeftRight,
  Printer,
  X,
  CheckCircle,
  AlertTriangle,
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
} from '@/components/ui';
import { cn, formatNumber } from '@/utils';
import api from '@/services/api';

const locationSchema = z.object({
  code: z.string().min(1, 'Lokasyon kodu gerekli'),
  name: z.string().optional(),
  zone: z.string().optional(),
  aisle: z.string().optional(),
  shelf: z.string().optional(),
  bin: z.string().optional(),
  locationType: z.enum(['DEDICATED', 'SHARED']).optional(),
  capacity: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

type LocationForm = z.infer<typeof locationSchema>;

interface Location {
  id: string;
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  warehouseId: string;
  locationType?: 'DEDICATED' | 'SHARED';
  isActive: boolean;
  capacity?: number;
  notes?: string;
  stocks?: Stock[];
  productAssignments?: ProductAssignment[];
  _count?: {
    stocks: number;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Stock {
  id: string;
  quantity: number;
  reservedQty: number;
  product: {
    id: string;
    name: string;
    sku: string;
    barcode?: string;
    gtin?: string;
    imageUrl?: string;
  };
  variant?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string;
  };
  location?: Location;
}

interface ProductAssignment {
  id: string;
  isPrimary: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  variant?: {
    id: string;
    name: string;
    sku: string;
  };
}

type ViewMode = 'list' | 'stock' | 'operations';

export default function Locations() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Raf İşlemleri state'leri
  const [operationMode, setOperationMode] = useState<'place' | 'search' | 'transfer'>('place');
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [foundProduct, setFoundProduct] = useState<any>(null);
  const [productLocations, setProductLocations] = useState<Stock[]>([]);
  const [selectedLocationForPlace, setSelectedLocationForPlace] = useState<string>('');
  const [placeQuantity, setPlaceQuantity] = useState<number>(1);
  
  // Transfer state'leri
  const [transferFromLocation, setTransferFromLocation] = useState<string>('');
  const [transferToLocation, setTransferToLocation] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  
  // Lokasyonsuz stok miktarı
  const [unassignedStock, setUnassignedStock] = useState<number>(0);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.getWarehouses(),
    staleTime: 60000, // 1 dakika cache
    refetchOnWindowFocus: false,
  });

  // URL parametresinden veya varsayılan depodan depo seçimi
  useEffect(() => {
    const warehouses = warehousesData?.data || [];
    if (warehouses.length === 0) return;
    
    // URL'den warehouse parametresini kontrol et
    const warehouseParam = searchParams.get('warehouse');
    
    if (warehouseParam) {
      // URL'deki depo ID'sinin geçerli olup olmadığını kontrol et
      const validWarehouse = warehouses.find((w: any) => w.id === warehouseParam);
      if (validWarehouse && selectedWarehouseId !== warehouseParam) {
        // URL'de farklı bir depo varsa güncelle
        setSelectedWarehouseId(warehouseParam);
        return;
      }
    }
    
    // URL parametresi yoksa ve henüz depo seçilmemişse varsayılan depoyu seç
    if (!selectedWarehouseId) {
      const defaultWarehouse = warehouses.find((w: any) => w.isDefault);
      if (defaultWarehouse) {
        setSelectedWarehouseId(defaultWarehouse.id);
      } else if (warehouses.length > 0) {
        // Varsayılan depo yoksa ilk depoyu seç
        setSelectedWarehouseId(warehouses[0].id);
      }
    }
  }, [warehousesData, searchParams, selectedWarehouseId]);

  const { data: locationsData, isLoading } = useQuery({
    queryKey: ['locations', selectedWarehouseId],
    queryFn: () => api.getLocations(selectedWarehouseId, {}),
    enabled: !!selectedWarehouseId,
    staleTime: 30000, // 30 saniye cache
    refetchOnWindowFocus: false,
  });

  const { data: warehouseStockData, isLoading: isLoadingStock } = useQuery({
    queryKey: ['warehouse-location-stock', selectedWarehouseId],
    queryFn: () => api.getWarehouseLocationStock(selectedWarehouseId),
    enabled: !!selectedWarehouseId && viewMode === 'stock',
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const { data: locationStockDetails } = useQuery({
    queryKey: ['location-stock-details', selectedLocation?.id],
    queryFn: () => api.getLocationStockDetails(selectedLocation!.id),
    enabled: !!selectedLocation?.id && isStockModalOpen,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: LocationForm) => api.createLocation(selectedWarehouseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Lokasyon eklendi');
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Lokasyon eklenemedi');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LocationForm }) => api.updateLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Lokasyon güncellendi');
      setIsModalOpen(false);
      setEditingLocation(null);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Lokasyon silindi');
    },
  });

  // Lokasyona stok ekleme mutation
  const addStockMutation = useMutation({
    mutationFn: (data: {
      productId: string;
      variantId?: string;
      warehouseId: string;
      locationId: string;
      quantity: number;
    }) => api.addStockToLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-location-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Ürün rafa yerleştirildi');
      resetOperationState();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Yerleştirme başarısız');
    },
  });

  // Stok transfer mutation
  const transferStockMutation = useMutation({
    mutationFn: (data: {
      productId: string;
      variantId?: string;
      warehouseId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
    }) => api.transferStockBetweenLocations(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-location-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Stok transfer edildi');
      resetOperationState();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Transfer başarısız');
    },
  });

  const onSubmit = (data: LocationForm) => {
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditModal = (location: Location) => {
    setEditingLocation(location);
    reset({
      code: location.code,
      name: location.name || '',
      zone: location.zone || '',
      aisle: location.aisle || '',
      shelf: location.shelf || '',
      bin: location.bin || '',
      locationType: location.locationType || 'SHARED',
      capacity: location.capacity,
      notes: location.notes || '',
    });
    setIsModalOpen(true);
  };

  // Barkod tarama fonksiyonları
  const startCamera = async () => {
    if (!scannerContainerRef.current) return;
    try {
      setCameraError(null);
      html5QrcodeRef.current = new Html5Qrcode("location-scanner", {
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
        { fps: 10, qrbox: { width: 300, height: 150 }, aspectRatio: 1.777778 },
        (decodedText) => handleBarcodeScan(decodedText),
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
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (err) {}
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

  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode.trim()) return;
    setBarcodeInput(barcode);
    await searchProduct(barcode.trim());
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchProduct(barcodeInput.trim());
    }
  };

  const searchProduct = async (query: string) => {
    if (!query) return;
    try {
      const result = await api.searchProductLocations(query);
      if (result.data) {
        setFoundProduct(result.data.product);
        setProductLocations(result.data.locations || []);
        
        // Lokasyonsuz stok miktarını getir
        if (selectedWarehouseId && result.data.product?.id) {
          try {
            const unassignedResult = await api.getUnassignedStock(
              result.data.product.id,
              selectedWarehouseId,
              result.data.matchedVariant?.id
            );
            setUnassignedStock(unassignedResult.data?.quantity || 0);
          } catch {
            setUnassignedStock(0);
          }
        }
        
        if (result.data.matchedVariant) {
          toast.success(`Varyant bulundu: ${result.data.matchedVariant.name}`);
        } else {
          toast.success(`Ürün bulundu: ${result.data.product.name}`);
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ürün bulunamadı');
      setFoundProduct(null);
      setProductLocations([]);
      setUnassignedStock(0);
    }
  };

  const resetOperationState = () => {
    setFoundProduct(null);
    setProductLocations([]);
    setBarcodeInput('');
    setSelectedLocationForPlace('');
    setPlaceQuantity(1);
    setTransferFromLocation('');
    setTransferToLocation('');
    setTransferQuantity(1);
    setUnassignedStock(0);
    if (!isCameraMode) {
      barcodeInputRef.current?.focus();
    }
  };

  const handlePlaceProduct = () => {
    if (!foundProduct || !selectedLocationForPlace || !selectedWarehouseId) {
      toast.error('Lütfen tüm alanları doldurun');
      return;
    }
    addStockMutation.mutate({
      productId: foundProduct.id,
      warehouseId: selectedWarehouseId,
      locationId: selectedLocationForPlace,
      quantity: placeQuantity,
    });
  };

  const handleTransferStock = () => {
    if (!foundProduct || !transferFromLocation || !transferToLocation || !selectedWarehouseId) {
      toast.error('Lütfen tüm alanları doldurun');
      return;
    }
    if (transferFromLocation === transferToLocation) {
      toast.error('Kaynak ve hedef lokasyon aynı olamaz');
      return;
    }
    transferStockMutation.mutate({
      productId: foundProduct.id,
      warehouseId: selectedWarehouseId,
      fromLocationId: transferFromLocation,
      toLocationId: transferToLocation,
      quantity: transferQuantity,
    });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    // Sadece operations sekmesine geçince ve kamera modu kapalıysa focus yap
    if (viewMode === 'operations' && !isCameraMode) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [viewMode, isCameraMode]); // operationMode kaldırıldı - gereksiz re-render önlendi

  const warehouses = warehousesData?.data || [];
  const locations = locationsData?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Lokasyon Yönetimi</h1>
          <p className="text-secondary-500">Depo lokasyonlarını ve raf yerleşimlerini yönetin</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={[
              { value: '', label: 'Depo Seçin' },
              ...warehouses.map((w: any) => ({ value: w.id, label: w.name })),
            ]}
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-64"
          />
          <Button
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              if (!selectedWarehouseId) {
                toast.error('Önce bir depo seçin');
                return;
              }
              setEditingLocation(null);
              reset({ code: '', name: '', zone: '', aisle: '', shelf: '', bin: '' });
              setIsModalOpen(true);
            }}
            disabled={!selectedWarehouseId}
          >
            Lokasyon Ekle
          </Button>
        </div>
      </div>

      {/* Tabs */}
      {selectedWarehouseId && (
        <div className="border-b border-secondary-200">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                viewMode === 'list'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
              )}
            >
              <List className="w-4 h-4" />
              Liste
            </button>
            <button
              onClick={() => setViewMode('stock')}
              className={cn(
                'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                viewMode === 'stock'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
              )}
            >
              <Package className="w-4 h-4" />
              Stok Görünümü
            </button>
            <button
              onClick={() => setViewMode('operations')}
              className={cn(
                'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                viewMode === 'operations'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
              )}
            >
              <ScanLine className="w-4 h-4" />
              Raf İşlemleri
            </button>
          </nav>
        </div>
      )}

      {/* Content */}
      {selectedWarehouseId ? (
        <>
          {/* Liste Görünümü */}
          {viewMode === 'list' && (
            <Card>
              <CardBody className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  </div>
                ) : locations.length > 0 ? (
                  <div className="divide-y divide-secondary-100">
                    {locations.map((location: Location) => (
                      <div key={location.id} className="flex items-center justify-between p-4 hover:bg-secondary-50">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-primary-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-secondary-900">{location.code}</h3>
                              {location.name && <span className="text-sm text-secondary-500">({location.name})</span>}
                              {!location.isActive && <Badge variant="secondary">Pasif</Badge>}
                              <Badge variant={location.locationType === 'DEDICATED' ? 'primary' : 'secondary'}>
                                {location.locationType === 'DEDICATED' ? 'Özel' : 'Ortak'}
                              </Badge>
                            </div>
                            <p className="text-sm text-secondary-500">
                              {[location.zone, location.aisle, location.shelf, location.bin].filter(Boolean).join(' - ') || 'Konum bilgisi yok'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedLocation(location); setIsStockModalOpen(true); }} title="Stok Detayları">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditModal(location)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm('Bu lokasyonu silmek istediğinize emin misiniz?')) deleteMutation.mutate(location.id); }} className="text-danger-600 hover:bg-danger-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state py-12">
                    <MapPin className="w-16 h-16 text-secondary-300 mb-4" />
                    <h3 className="text-lg font-medium text-secondary-900 mb-2">Lokasyon bulunamadı</h3>
                    <p className="text-secondary-500 mb-4">Bu depo için lokasyon ekleyerek başlayın</p>
                    <Button onClick={() => setIsModalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      İlk Lokasyonu Ekle
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Stok Görünümü */}
          {viewMode === 'stock' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoadingStock ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : (warehouseStockData?.data && warehouseStockData.data.length > 0) ? (
                warehouseStockData.data.map((location: any) => {
                  const totalProducts = location.stocks?.length || 0;
                  const totalQuantity = location.stocks?.reduce((sum: number, stock: Stock) => sum + stock.quantity, 0) || 0;
                  const capacityPercent = location.capacity ? Math.min(100, (totalQuantity / location.capacity) * 100) : 0;
                  
                  return (
                    <Card key={location.id} className="hover:shadow-lg transition-shadow">
                      <CardBody>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-primary-600" />
                              {location.code}
                            </h3>
                            {location.name && <p className="text-sm text-secondary-500 mt-1">{location.name}</p>}
                            <p className="text-xs text-secondary-400 mt-1">
                              {[location.zone, location.aisle, location.shelf, location.bin].filter(Boolean).join(' - ') || 'Konum bilgisi yok'}
                            </p>
                          </div>
                          <Badge variant={location.locationType === 'DEDICATED' ? 'primary' : 'secondary'}>
                            {location.locationType === 'DEDICATED' ? 'Özel' : 'Ortak'}
                          </Badge>
                        </div>
                        
                        {/* Kapasite göstergesi */}
                        {location.capacity && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-secondary-500">Doluluk</span>
                              <span className="font-medium">{totalQuantity} / {location.capacity}</span>
                            </div>
                            <div className="w-full bg-secondary-200 rounded-full h-2">
                              <div 
                                className={cn(
                                  "h-2 rounded-full transition-all",
                                  capacityPercent > 90 ? 'bg-danger-500' : capacityPercent > 70 ? 'bg-warning-500' : 'bg-success-500'
                                )}
                                style={{ width: `${capacityPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-secondary-600">Ürün Sayısı:</span>
                            <span className="font-semibold text-secondary-900">{totalProducts}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-secondary-600">Toplam Miktar:</span>
                            <span className="font-semibold text-primary-600">{formatNumber(totalQuantity)}</span>
                          </div>
                        </div>

                        {location.stocks && location.stocks.length > 0 && (
                          <div className="border-t pt-3">
                            <p className="text-xs font-medium text-secondary-700 mb-2">Ürünler:</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {location.stocks.slice(0, 3).map((stock: Stock) => (
                                <div key={stock.id} className="flex items-center justify-between text-xs py-1">
                                  <span className="text-secondary-600 truncate flex-1">
                                    {stock.product.name}
                                    {stock.variant && ` - ${stock.variant.name}`}
                                  </span>
                                  <span className="font-semibold text-secondary-900 ml-2">{stock.quantity}</span>
                                </div>
                              ))}
                              {location.stocks.length > 3 && (
                                <p className="text-xs text-secondary-400 text-center pt-1">+{location.stocks.length - 3} ürün daha...</p>
                              )}
                            </div>
                          </div>
                        )}

                        <Button variant="secondary" size="sm" className="w-full mt-3" onClick={() => { setSelectedLocation(location); setIsStockModalOpen(true); }} leftIcon={<Eye className="w-4 h-4" />}>
                          Detayları Görüntüle
                        </Button>
                      </CardBody>
                    </Card>
                  );
                })
              ) : (
                <div className="col-span-full">
                  <Card>
                    <CardBody className="py-12">
                      <div className="text-center">
                        <Package className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-secondary-900 mb-2">Lokasyon stok bilgisi bulunamadı</h3>
                        <p className="text-secondary-500">Bu depo için lokasyon stok bilgisi yok</p>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Raf İşlemleri */}
          {viewMode === 'operations' && (
            <div className="space-y-6">
              {/* İşlem Modu Seçimi */}
              <div className="flex items-center gap-2">
                <Button
                  variant={operationMode === 'place' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOperationMode('place')}
                  leftIcon={<Package className="w-4 h-4" />}
                >
                  Rafa Yerleştir
                </Button>
                <Button
                  variant={operationMode === 'search' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOperationMode('search')}
                  leftIcon={<Search className="w-4 h-4" />}
                >
                  Ürün Nerede?
                </Button>
                <Button
                  variant={operationMode === 'transfer' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setOperationMode('transfer')}
                  leftIcon={<ArrowLeftRight className="w-4 h-4" />}
                >
                  Stok Taşı
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Barkod Tarama Alanı */}
                <Card>
                  <CardBody>
                    <h3 className="font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                      <ScanLine className="w-5 h-5" />
                      Barkod Okut
                    </h3>

                    {/* Kamera/Manuel Seçimi */}
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={!isCameraMode ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => isCameraMode && toggleCameraMode()}
                        className="flex-1"
                      >
                        <Keyboard className="w-4 h-4 mr-2" />
                        Manuel / Okuyucu
                      </Button>
                      <Button
                        variant={isCameraMode ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => !isCameraMode && toggleCameraMode()}
                        className="flex-1"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Kamera
                      </Button>
                    </div>

                    {isCameraMode ? (
                      <div className="space-y-2">
                        <div id="location-scanner" ref={scannerContainerRef} className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: '200px' }} />
                        {cameraError && <div className="p-3 bg-danger-50 rounded-xl text-danger-700 text-sm">{cameraError}</div>}
                        {!isCameraActive && !cameraError && (
                          <Button onClick={startCamera} className="w-full" size="sm">
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
                        placeholder="Barkod veya SKU girin..."
                        leftIcon={<ScanLine className="w-5 h-5" />}
                      />
                    )}

                    {barcodeInput && !isCameraMode && (
                      <Button onClick={() => searchProduct(barcodeInput)} className="w-full mt-2" size="sm">
                        <Search className="w-4 h-4 mr-2" />
                        Ara
                      </Button>
                    )}
                  </CardBody>
                </Card>

                {/* Sonuç ve İşlem Alanı */}
                <Card>
                  <CardBody>
                    {foundProduct ? (
                      <div className="space-y-4">
                        {/* Ürün Bilgisi */}
                        <div className="p-4 bg-success-50 rounded-xl border border-success-200">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0 mt-1" />
                            <div className="flex-1">
                              <h4 className="font-semibold text-secondary-900">{foundProduct.name}</h4>
                              <p className="text-sm text-secondary-600">SKU: {foundProduct.sku}</p>
                              {foundProduct.barcode && <p className="text-sm text-secondary-600">Barkod: {foundProduct.barcode}</p>}
                            </div>
                            {foundProduct.imageUrl && (
                              <img src={foundProduct.imageUrl} alt={foundProduct.name} className="w-16 h-16 object-cover rounded-lg" />
                            )}
                          </div>
                        </div>

                        {/* Mevcut Lokasyonlar */}
                        {productLocations.length > 0 && (
                          <div>
                            <h4 className="font-medium text-secondary-900 mb-2">Mevcut Lokasyonlar:</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {productLocations.map((stock) => (
                                <div key={stock.id} className="flex items-center justify-between p-2 bg-secondary-50 rounded-lg text-sm">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-primary-600" />
                                    <span className="font-medium">{stock.location?.code}</span>
                                    <span className="text-secondary-500">({stock.location?.warehouse?.name})</span>
                                  </div>
                                  <span className="font-semibold text-primary-600">{stock.quantity} adet</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Rafa Yerleştir */}
                        {operationMode === 'place' && (
                          <div className="space-y-3 pt-4 border-t">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium text-secondary-900">Rafa Yerleştir:</h4>
                              <Badge variant={unassignedStock > 0 ? 'success' : 'danger'}>
                                Rafa atanmamış: {unassignedStock} adet
                              </Badge>
                            </div>
                            
                            {unassignedStock === 0 ? (
                              <div className="p-4 bg-warning-50 rounded-xl border border-warning-200">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-warning-800">Rafa atanacak stok yok</p>
                                    <p className="text-xs text-warning-600 mt-1">
                                      Tüm stok zaten raflara yerleştirilmiş veya depoda bu üründen stok bulunmuyor.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <Select
                                  label="Lokasyon Seç"
                                  value={selectedLocationForPlace}
                                  onChange={(e) => setSelectedLocationForPlace(e.target.value)}
                                  options={[
                                    { value: '', label: 'Lokasyon seçin' },
                                    ...locations.map((l: Location) => ({
                                      value: l.id,
                                      label: `${l.code} ${l.name ? `(${l.name})` : ''}`
                                    })),
                                  ]}
                                />
                                <Input
                                  label={`Miktar (Maks: ${unassignedStock})`}
                                  type="number"
                                  min={1}
                                  max={unassignedStock}
                                  value={placeQuantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    setPlaceQuantity(Math.min(val, unassignedStock));
                                  }}
                                />
                                <Button
                                  onClick={handlePlaceProduct}
                                  isLoading={addStockMutation.isPending}
                                  disabled={!selectedLocationForPlace || placeQuantity > unassignedStock}
                                  className="w-full"
                                >
                                  <Package className="w-4 h-4 mr-2" />
                                  Yerleştir ({placeQuantity} adet)
                                </Button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Stok Taşı */}
                        {operationMode === 'transfer' && productLocations.length > 0 && (
                          <div className="space-y-3 pt-4 border-t">
                            <h4 className="font-medium text-secondary-900">Stok Taşı:</h4>
                            <Select
                              label="Kaynak Lokasyon"
                              value={transferFromLocation}
                              onChange={(e) => setTransferFromLocation(e.target.value)}
                              options={[
                                { value: '', label: 'Kaynak seçin' },
                                ...productLocations.map((stock) => ({
                                  value: stock.location?.id || '',
                                  label: `${stock.location?.code} (${stock.quantity} adet)`
                                })),
                              ]}
                            />
                            <Select
                              label="Hedef Lokasyon"
                              value={transferToLocation}
                              onChange={(e) => setTransferToLocation(e.target.value)}
                              options={[
                                { value: '', label: 'Hedef seçin' },
                                ...locations.map((l: Location) => ({
                                  value: l.id,
                                  label: `${l.code} ${l.name ? `(${l.name})` : ''}`
                                })),
                              ]}
                            />
                            <Input
                              label="Miktar"
                              type="number"
                              min={1}
                              value={transferQuantity}
                              onChange={(e) => setTransferQuantity(parseInt(e.target.value) || 1)}
                            />
                            <Button
                              onClick={handleTransferStock}
                              isLoading={transferStockMutation.isPending}
                              disabled={!transferFromLocation || !transferToLocation}
                              className="w-full"
                            >
                              <ArrowLeftRight className="w-4 h-4 mr-2" />
                              Transfer Et
                            </Button>
                          </div>
                        )}

                        {/* Temizle Butonu */}
                        <Button variant="secondary" onClick={resetOperationState} className="w-full">
                          <X className="w-4 h-4 mr-2" />
                          Temizle
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <ScanLine className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-secondary-900 mb-2">
                          {operationMode === 'place' && 'Rafa yerleştirmek için ürün okutun'}
                          {operationMode === 'search' && 'Ürün aramak için barkod okutun'}
                          {operationMode === 'transfer' && 'Transfer için ürün okutun'}
                        </h3>
                        <p className="text-secondary-500">
                          Barkod okuyucu veya kamera kullanabilirsiniz
                        </p>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardBody className="py-12">
            <div className="text-center">
              <MapPin className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">Depo Seçin</h3>
              <p className="text-secondary-500">Lokasyonları görüntülemek için bir depo seçin</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Lokasyon Ekleme/Düzenleme Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLocation(null); }}
        title={editingLocation ? 'Lokasyonu Düzenle' : 'Yeni Lokasyon'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input label="Lokasyon Kodu *" placeholder="Örn: A-01-02-03" error={errors.code?.message} {...register('code')} />
          <Input label="Lokasyon Adı" placeholder="Opsiyonel açıklayıcı isim" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Bölge (Zone)" placeholder="A, B, C..." error={errors.zone?.message} {...register('zone')} />
            <Input label="Koridor (Aisle)" placeholder="01, 02, 03..." error={errors.aisle?.message} {...register('aisle')} />
            <Input label="Raf (Shelf)" placeholder="01, 02, 03..." error={errors.shelf?.message} {...register('shelf')} />
            <Input label="Göz (Bin)" placeholder="01, 02, 03..." error={errors.bin?.message} {...register('bin')} />
          </div>
          <Select
            label="Raf Tipi"
            options={[
              { value: 'SHARED', label: 'Ortak Raf (Birden fazla ürün için)' },
              { value: 'DEDICATED', label: 'Özel Raf (Tek ürün için)' },
            ]}
            defaultValue={editingLocation?.locationType || 'SHARED'}
            {...register('locationType')}
          />
          <Input label="Kapasite" type="number" placeholder="Maksimum ürün sayısı" error={errors.capacity?.message} {...register('capacity', { valueAsNumber: true })} />
          <Input label="Notlar" placeholder="Ek notlar" error={errors.notes?.message} {...register('notes')} />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setIsModalOpen(false); setEditingLocation(null); }}>İptal</Button>
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
              {editingLocation ? 'Güncelle' : 'Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Lokasyon Stok Detay Modal */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => { setIsStockModalOpen(false); setSelectedLocation(null); }}
        title={selectedLocation ? `Lokasyon Stok Detayları: ${selectedLocation.code}` : 'Stok Detayları'}
        size="lg"
      >
        {locationStockDetails?.data ? (
          <div className="space-y-4">
            <div className="p-4 bg-secondary-50 rounded-xl">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-secondary-600">Lokasyon Kodu:</span>
                  <p className="font-semibold text-secondary-900">{locationStockDetails.data.code}</p>
                </div>
                {locationStockDetails.data.name && (
                  <div>
                    <span className="text-secondary-600">Lokasyon Adı:</span>
                    <p className="font-semibold text-secondary-900">{locationStockDetails.data.name}</p>
                  </div>
                )}
                <div>
                  <span className="text-secondary-600">Konum:</span>
                  <p className="font-semibold text-secondary-900">
                    {[locationStockDetails.data.zone, locationStockDetails.data.aisle, locationStockDetails.data.shelf, locationStockDetails.data.bin].filter(Boolean).join(' - ') || 'Belirtilmemiş'}
                  </p>
                </div>
                <div>
                  <span className="text-secondary-600">Raf Tipi:</span>
                  <Badge variant={locationStockDetails.data.locationType === 'DEDICATED' ? 'primary' : 'secondary'}>
                    {locationStockDetails.data.locationType === 'DEDICATED' ? 'Özel Raf' : 'Ortak Raf'}
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-secondary-900 flex items-center gap-2 mb-3">
                <Package className="w-5 h-5" />
                Ürünler ({locationStockDetails.data.stocks?.length || 0})
              </h3>
              {locationStockDetails.data.stocks && locationStockDetails.data.stocks.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {locationStockDetails.data.stocks.map((stock: Stock) => (
                    <Card key={stock.id}>
                      <CardBody className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-secondary-900">{stock.product.name}</h4>
                              {stock.variant && <Badge variant="secondary" className="text-xs">{stock.variant.name}</Badge>}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-secondary-600 mt-2">
                              <div>
                                <span>SKU:</span>
                                <p className="font-mono text-xs">{stock.variant?.sku || stock.product.sku}</p>
                              </div>
                              {(stock.product?.barcode || stock.product?.gtin || stock.variant?.barcode) && (
                                <div>
                                  <span>Barkod:</span>
                                  <p className="font-mono text-xs">{stock.variant?.barcode || stock.product?.gtin || stock.product?.barcode || '-'}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-2xl font-bold text-primary-600">{stock.quantity}</p>
                            <p className="text-xs text-secondary-500">adet</p>
                            {stock.reservedQty > 0 && <p className="text-xs text-warning-600 mt-1">({stock.reservedQty} rezerve)</p>}
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
                  <p className="text-secondary-600">Bu lokasyonda ürün bulunmuyor</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        )}
      </Modal>
    </div>
  );
}
