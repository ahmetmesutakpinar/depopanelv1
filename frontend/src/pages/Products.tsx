import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  AlertTriangle,
  AlertCircle,
  MapPin,
  Gift,
  X,
  ShoppingCart,
  RefreshCw,
  Link,
  GitMerge,
  Warehouse,
} from 'lucide-react';
import toast from 'react-hot-toast';
import BulkActions from '@/components/BulkActions';
import AdvancedFilters from '@/components/AdvancedFilters';
import MarketplaceIcon from '@/components/MarketplaceIcon';
import ProductWarehouseManagement from '@/components/ProductWarehouseManagement';
import { exportToCSV, formatCurrencyForExport } from '@/utils/export';
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
import { formatCurrency, formatNumber, cn } from '@/utils';
import api from '@/services/api';
import type { Product } from '@/utils/types';

// ===== PRODUCTS TAB CONTENT =====
const productSchema = z.object({
  sku: z.string().min(1, 'SKU gerekli'),
  barcode: z.string().optional(),
  gtin: z.string().optional(), // GTIN, UPC, EAN, ISBN
  name: z.string().min(2, 'Ürün adı en az 2 karakter olmalı'),
  description: z.string().optional(),
  brand: z.string().optional(),
  price: z.coerce.number().positive('Fiyat pozitif olmalı'),
  costPrice: z.coerce.number().positive().optional(),
  taxRate: z.coerce.number().min(0).max(100).default(20),
  campaignSetId: z.string().uuid().optional().or(z.literal('')), // Campaign Set ID (FK relation)
  warehouseId: z.string().optional(),
  locationId: z.string().optional(),
  initialQuantity: z.coerce.number().int().min(0).optional(),
});

type ProductForm = z.infer<typeof productSchema>;

const matchProductSchema = z.object({
  integrationId: z.string().uuid('Geçersiz integration ID'),
  marketplaceProductId: z.string().min(1, 'Marketplace product ID gerekli'),
  sku: z.string().optional(),
  barcode: z.string().optional().nullable(),
  price: z.coerce.number().optional().nullable(),
  listingUrl: z.preprocess(
    (val) => {
      if (!val || val === '' || val === null || val === undefined) {
        return undefined;
      }
      return val;
    },
    z.string().url('Geçerli URL girin').optional()
  ),
});

type MatchProductForm = z.infer<typeof matchProductSchema>;

function ProductsTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedProductForDelete, setSelectedProductForDelete] = useState<string | null>(null);
  const [hardDelete, setHardDelete] = useState(false);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedProductForMatch, setSelectedProductForMatch] = useState<Product | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [selectedProductForMerge, setSelectedProductForMerge] = useState<Product | null>(null);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [selectedProductForWarehouse, setSelectedProductForWarehouse] = useState<string | null>(null);

  // ✅ FIX: Product list MUST show ALL active products
  // NO filtering by marketplace link status, productId, or order linkage
  // WooCommerce is PRODUCT MASTER - all Woo products must be visible
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, sortBy, sortOrder],
    queryFn: () => api.getProducts({ page, limit: 20, search, sortBy, sortOrder }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const { data: campaignSetsData } = useQuery({
    queryKey: ['campaign-sets'],
    queryFn: () => api.getCampaignSets({ page: 1, limit: 1000 }),
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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      taxRate: 20,
    },
  });

  // Find default warehouse for initial stock
  const warehouses = warehousesData?.data || [];
  const defaultWarehouse = warehouses.find((w: any) => w.isDefault);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      toast.success('Ürün oluşturuldu');
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ürün oluşturulamadı');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      toast.success('Ürün güncellendi');
      setIsModalOpen(false);
      setEditingProduct(null);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success(hardDelete ? 'Ürün kalıcı olarak silindi' : 'Ürün silindi');
      setDeleteModalOpen(false);
      setSelectedProductForDelete(null);
      setHardDelete(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ürün silinemedi');
    },
  });

  // Match Product Form
  const {
    register: registerMatch,
    handleSubmit: handleSubmitMatch,
    reset: resetMatch,
    formState: { errors: errorsMatch },
  } = useForm<MatchProductForm>({
    resolver: zodResolver(matchProductSchema),
  });

  const matchMutation = useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: MatchProductForm }) =>
      api.matchProduct(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Ürün marketplace ile eşleştirildi');
      setMatchModalOpen(false);
      setSelectedProductForMatch(null);
      resetMatch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Eşleştirme başarısız');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ masterProductId, duplicateProductId }: { masterProductId: string; duplicateProductId: string }) =>
      api.mergeProducts(masterProductId, duplicateProductId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Ürünler başarıyla birleştirildi');
      setMergeModalOpen(false);
      setSelectedProductForMerge(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Birleştirme başarısız');
    },
  });

  // Bulk actions
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const promises = ids.map((id) => api.deleteProduct(id));
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${selectedProducts.length} ürün silindi`);
      setSelectedProducts([]);
    },
  });

  const handleBulkExport = (items: Product[]) => {
    exportToCSV(
      items,
      [
        { key: 'name', label: 'Ürün Adı' },
        { key: 'sku', label: 'SKU' },
        { key: 'barcode', label: 'Barkod' },
        { key: 'price', label: 'Fiyat', format: formatCurrencyForExport },
        { key: 'totalStock', label: 'Toplam Stok' },
        { key: 'isActive', label: 'Durum', format: (v) => v ? 'Aktif' : 'Pasif' },
      ],
      { filename: 'urunler' }
    );
  };

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.syncIntegration(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Ürünler senkronize edildi');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      // Ürünleri yenile ve sayfayı refresh et
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        window.location.reload();
      }, 5000);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Senkronizasyon başlatılamadı');
    },
  });

  const onSubmit = (data: ProductForm) => {
    const productData: any = {
      sku: data.sku,
      barcode: data.barcode,
      gtin: data.gtin,
      name: data.name,
      description: data.description,
      brand: data.brand,
      price: data.price,
      costPrice: data.costPrice,
      taxRate: data.taxRate,
      // Campaign Set ID (FK relation - single source of truth)
      campaignSetId: data.campaignSetId && data.campaignSetId.trim() !== '' ? data.campaignSetId : null,
    };

    if (editingProduct) {
      // Düzenleme modunda lokasyon ataması kaldırıldı
      updateMutation.mutate({ id: editingProduct.id, data: productData });
    } else {
      // Yeni ürün oluşturma
      // Varsayılan depoyu kullan (depo seçimi kaldırıldı)
      if (data.initialQuantity !== undefined && data.initialQuantity > 0) {
        if (defaultWarehouse) {
          productData.initialStock = {
            warehouseId: defaultWarehouse.id,
            quantity: data.initialQuantity || 0,
          };
        } else {
          toast.error('Varsayılan depo bulunamadı. Lütfen önce bir depo oluşturun.');
          return;
        }
      }
      createMutation.mutate(productData);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    
    reset({
      sku: product.sku,
      barcode: product.barcode || '',
      gtin: product.gtin || '',
      name: product.name,
      description: product.description || '',
      brand: product.brand || '',
      price: product.price,
      costPrice: product.costPrice || undefined,
      taxRate: product.taxRate,
      campaignSetId: (product as any).campaignSetId || '',
    });
    setIsModalOpen(true);
  };

  // ✅ FIX: Product list shows ALL products from API - NO filtering
  // Marketplace link status (matchedMarketplaces/missingMarketplaces) is display-only metadata
  // Products are NEVER filtered by marketplace link status in product list
  const products = productsData?.data || [];
  const pagination = productsData?.pagination;
  const campaignSets = campaignSetsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Ürün adı, SKU veya barkod ara..."
                leftIcon={<Search className="w-5 h-5" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Sorting Dropdown */}
            <div className="flex gap-2">
              <Select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1); // Reset to first page when sorting changes
                }}
                className="min-w-[150px]"
                options={[
                  { value: 'name', label: 'Ad' },
                  { value: 'sku', label: 'SKU' },
                  { value: 'price', label: 'Fiyat' },
                  { value: 'stock', label: 'Stok' },
                  { value: 'createdAt', label: 'Oluşturulma Tarihi' },
                ]}
              />
              <Select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as 'asc' | 'desc');
                  setPage(1); // Reset to first page when sort order changes
                }}
                className="min-w-[120px]"
                options={
                  sortBy === 'name' || sortBy === 'sku'
                    ? [
                        { value: 'asc', label: 'A-Z' },
                        { value: 'desc', label: 'Z-A' },
                      ]
                    : sortBy === 'price' || sortBy === 'stock'
                    ? [
                        { value: 'asc', label: 'Düşük-Yüksek' },
                        { value: 'desc', label: 'Yüksek-Düşük' },
                      ]
                    : [
                        { value: 'desc', label: 'Yeni-Eski' },
                        { value: 'asc', label: 'Eski-Yeni' },
                      ]
                }
              />
            </div>
            <AdvancedFilters
              filters={[
                { key: 'isActive', label: 'Durum', type: 'select', options: [
                  { value: 'true', label: 'Aktif' },
                  { value: 'false', label: 'Pasif' },
                ]},
                { key: 'lowStock', label: 'Düşük Stok', type: 'select', options: [
                  { value: 'true', label: 'Evet' },
                  { value: 'false', label: 'Hayır' },
                ]},
              ]}
              values={filterValues}
              onChange={setFilterValues}
              onReset={() => setFilterValues({})}
            />
            {integrationsData?.data && integrationsData.data.filter((i: any) => i.status === 'ACTIVE').length > 0 && (
              <Button
                variant="secondary"
                leftIcon={<RefreshCw className={cn("w-4 h-4", syncMutation.isPending && "animate-spin")} />}
                onClick={() => {
                  const activeIntegrations = integrationsData.data?.filter((i: any) => i.status === 'ACTIVE') || [];
                  if (activeIntegrations.length === 1) {
                    syncMutation.mutate(activeIntegrations[0].id);
                  } else if (activeIntegrations.length > 1) {
                    // Birden fazla aktif entegrasyon varsa, hepsini senkronize et
                    Promise.all(activeIntegrations.map((integration: any) => 
                      api.syncIntegration(integration.id)
                    )).then(() => {
                      toast.success(`${activeIntegrations.length} entegrasyon senkronize edildi`);
                      queryClient.invalidateQueries({ queryKey: ['integrations'] });
                      setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['products'] });
                        window.location.reload();
                      }, 5000);
                    }).catch(() => {
                      toast.error('Senkronizasyon sırasında hata oluştu');
                    });
                  }
                }}
                disabled={syncMutation.isPending}
              >
                Senkronize Et
              </Button>
            )}
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditingProduct(null);
                reset({
                  sku: '',
                  barcode: '',
                  gtin: '',
                  name: '',
                  description: '',
                  brand: '',
                  price: 0,
                  taxRate: 20,
                });
                setIsModalOpen(true);
              }}
            >
              Yeni Ürün
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Bulk Actions */}
      {selectedProducts.length > 0 && (
        <BulkActions
          selectedItems={selectedProducts}
          items={products}
          onSelectAll={(selected) => {
            setSelectedProducts(selected ? products.map((p) => p.id) : []);
          }}
          onBulkDelete={(ids) => {
            if (confirm(`${ids.length} ürünü silmek istediğinize emin misiniz?`)) {
              bulkDeleteMutation.mutate(ids);
            }
          }}
          onBulkExport={handleBulkExport}
          getItemId={(item) => item.id}
        />
      )}

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : products.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedProducts.length === products.length && products.length > 0}
                      onChange={(e) => {
                        setSelectedProducts(e.target.checked ? products.map((p) => p.id) : []);
                      }}
                      className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                    />
                  </TableHeader>
                  <TableHeader>Ürün</TableHeader>
                  <TableHeader>SKU</TableHeader>
                  <TableHeader>Lokasyon</TableHeader>
                  <TableHeader>Fiyat</TableHeader>
                  <TableHeader>Stok</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Marketplace</TableHeader>
                  <TableHeader className="w-12">{''}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {products.map((product: Product) => {
                  const isSelected = selectedProducts.includes(product.id);
                  return (
                    <TableRow key={product.id} className={isSelected ? 'bg-primary-50' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts([...selectedProducts, product.id]);
                            } else {
                              setSelectedProducts(selectedProducts.filter((id) => id !== product.id));
                            }
                          }}
                          className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-secondary-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-secondary-900">{product.name}</p>
                          {product.brand && (
                            <p className="text-sm text-secondary-500">{product.brand}</p>
                          )}
                        </div>
                        </div>
                      </TableCell>
                    <TableCell>
                      <code className="text-sm bg-secondary-100 px-2 py-1 rounded">
                        {product.sku}
                      </code>
                    </TableCell>
                    <TableCell>
                      {product.primaryLocation ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary-600" />
                          <span className="text-sm font-medium text-secondary-900">
                            {product.primaryLocation.code}
                          </span>
                          {product.primaryLocation.name && (
                            <span className="text-xs text-secondary-500">
                              ({product.primaryLocation.name})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-secondary-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(product.price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'font-medium',
                          product.totalStock <= 5 ? 'text-danger-600' : 'text-secondary-900'
                        )}>
                          {formatNumber(product.totalStock)}
                        </span>
                        {product.totalStock <= 5 && (
                          <AlertTriangle className="w-4 h-4 text-warning-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'success' : 'secondary'}>
                        {product.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const matchedMarketplaces = product.matchedMarketplaces || [];
                        const missingMarketplaces = product.missingMarketplaces || [];
                        const totalCount = matchedMarketplaces.length + missingMarketplaces.length;
                        
                        if (totalCount === 0) {
                          return <span className="text-xs text-secondary-400">-</span>;
                        }
                        
                        // Aktif marketplace logolarını göster
                        if (matchedMarketplaces.length > 0) {
                          return (
                            <div className="flex items-center gap-2 flex-wrap">
                              {matchedMarketplaces.map((marketplaceType: string) => {
                                const listingUrl = product.marketplaceLinks?.[marketplaceType];
                                const marketplaceName = marketplaceType === 'WOOCOMMERCE' ? 'WooCommerce' :
                                                       marketplaceType === 'TRENDYOL' ? 'Trendyol' :
                                                       marketplaceType === 'HEPSIBURADA' ? 'Hepsiburada' :
                                                       marketplaceType === 'N11' ? 'N11' :
                                                       marketplaceType === 'AMAZON' ? 'Amazon' :
                                                       marketplaceType === 'PAZARAMA' ? 'Pazarama' :
                                                       marketplaceType === 'SHOPIFY' ? 'Shopify' :
                                                       marketplaceType === 'IKAS' ? 'Ikas' :
                                                       marketplaceType;
                                
                                return (
                                  <a
                                    key={marketplaceType}
                                    href={listingUrl || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                      if (!listingUrl) {
                                        e.preventDefault();
                                        toast.error(`${marketplaceName} ürün linki bulunamadı`);
                                      }
                                      e.stopPropagation();
                                    }}
                                    className={cn(
                                      "group relative flex items-center justify-center transition-all duration-200",
                                      listingUrl 
                                        ? "hover:scale-110 cursor-pointer" 
                                        : "opacity-50 cursor-not-allowed"
                                    )}
                                    title={
                                      listingUrl 
                                        ? `${marketplaceName} - Ürün sayfasına git` 
                                        : `${marketplaceName} - Link bulunamadı`
                                    }
                                  >
                                    <MarketplaceIcon 
                                      type={marketplaceType} 
                                      className={cn(
                                        "w-8 h-8 transition-all duration-200",
                                        listingUrl && "group-hover:shadow-lg group-hover:ring-2 group-hover:ring-primary-300"
                                      )}
                                    />
                                    {listingUrl && (
                                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary-500 rounded-full border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          );
                        }
                        
                        // Hiç eşleşmemiş
                        return (
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" size="sm">
                              {missingMarketplaces.length}
                            </Badge>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedProductForWarehouse(product.id);
                            setWarehouseModalOpen(true);
                          }}
                          className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                          title="Depo Stok Yönetimi"
                        >
                          <Warehouse className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProductForMatch(product);
                            setMatchModalOpen(true);
                          }}
                          className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                          title="Marketplace Eşleştir"
                        >
                          <Link className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProductForMerge(product);
                            setMergeModalOpen(true);
                          }}
                          className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                          title="Ürün Birleştir"
                        >
                          <GitMerge className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProductForDelete(product.id);
                            setDeleteModalOpen(true);
                          }}
                          className="p-2 text-secondary-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-state py-12">
              <Package className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">Ürün bulunamadı</h3>
              <p className="text-secondary-500 mb-4">
                {search ? 'Aramanızla eşleşen ürün yok' : 'Henüz ürün eklenmemiş'}
              </p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Ürününüzü Ekleyin
              </Button>
            </div>
          )}
        </CardBody>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-100">
            <p className="text-sm text-secondary-500">
              Toplam {pagination.total} ürün
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        title={editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Stok kodu (SKU) *"
              placeholder="URUN-001"
              error={errors.sku?.message}
              {...register('sku')}
            />
            <Input
              label="Barkod"
              placeholder="8690123456789"
              {...register('barcode')}
            />
          </div>
          
          <Input
            label="GTIN, UPC, EAN veya ISBN"
            placeholder="1234567890456"
            {...register('gtin')}
          />

          <Input
            label="Ürün Adı *"
            placeholder="Ürün adını girin"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Marka"
              placeholder="Marka adı"
              {...register('brand')}
            />
            <Input
              label="Satış Fiyatı *"
              type="number"
              step="0.01"
              placeholder="0.00"
              error={errors.price?.message}
              {...register('price')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Maliyet Fiyatı"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('costPrice')}
            />
            <Input
              label="KDV Oranı (%)"
              type="number"
              placeholder="20"
              {...register('taxRate')}
            />
          </div>

          <div className="space-y-3 pt-4 border-t border-secondary-100">
            <div>
              <Select
                label="Campaign Set (Bu ürün settir)"
                options={[
                  { value: '', label: 'Set değil' },
                  ...campaignSets.map((set: any) => ({ 
                    value: set.id, 
                    label: `${set.name} (${set.sku})` 
                  })),
                ]}
                placeholder="Set seçin (opsiyonel)"
                {...register('campaignSetId')}
              />
              <p className="mt-1.5 text-xs text-secondary-500">
                Bu ürün bir Campaign Set ise, ilgili seti seçin. Set stoğu ve component stokları otomatik yönetilir.
              </p>
            </div>
          </div>

          {/* Başlangıç Stoğu - Sadece yeni ürün için */}
          {!editingProduct && (
            <div className="pt-4 border-t border-secondary-100">
              <Input
                label="Başlangıç Stoğu"
                type="number"
                min="0"
                placeholder="0"
                hint={defaultWarehouse ? `Stok ${defaultWarehouse.name} deposuna eklenecek` : "Varsayılan depo bulunamadı"}
                {...register('initialQuantity')}
              />
            </div>
          )}

          {/* Marketplace Bağlantıları - Sadece düzenleme modunda */}
          {editingProduct && editingProduct.matchedMarketplaces && editingProduct.matchedMarketplaces.length > 0 && (
            <div className="pt-4 border-t border-secondary-100">
              <label className="block text-sm font-medium text-secondary-900 mb-3">
                Pazaryeri Bağlantıları
              </label>
              <div className="flex items-center gap-3 flex-wrap p-4 bg-secondary-50 rounded-lg border border-secondary-200">
                {editingProduct.matchedMarketplaces.map((marketplaceType: string) => {
                  const listingUrl = editingProduct.marketplaceLinks?.[marketplaceType];
                  const marketplaceName = marketplaceType === 'WOOCOMMERCE' ? 'WooCommerce' :
                                         marketplaceType === 'TRENDYOL' ? 'Trendyol' :
                                         marketplaceType === 'HEPSIBURADA' ? 'Hepsiburada' :
                                         marketplaceType === 'N11' ? 'N11' :
                                         marketplaceType === 'AMAZON' ? 'Amazon' :
                                         marketplaceType === 'PAZARAMA' ? 'Pazarama' :
                                         marketplaceType === 'SHOPIFY' ? 'Shopify' :
                                         marketplaceType === 'IKAS' ? 'Ikas' :
                                         marketplaceType;
                  
                  return (
                    <a
                      key={marketplaceType}
                      href={listingUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!listingUrl) {
                          e.preventDefault();
                          toast.error(`${marketplaceName} ürün linki bulunamadı`);
                        }
                      }}
                      className={cn(
                        "group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200",
                        listingUrl 
                          ? "bg-white border-secondary-300 hover:border-primary-400 hover:shadow-md cursor-pointer" 
                          : "bg-secondary-100 border-secondary-200 opacity-60 cursor-not-allowed"
                      )}
                      title={
                        listingUrl 
                          ? `${marketplaceName} - Ürün sayfasına git` 
                          : `${marketplaceName} - Link bulunamadı`
                      }
                    >
                      <MarketplaceIcon 
                        type={marketplaceType} 
                        className="w-6 h-6"
                      />
                      <span className="text-sm font-medium text-secondary-700">
                        {marketplaceName}
                      </span>
                      {listingUrl && (
                        <Link className="w-4 h-4 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setEditingProduct(null);
              }}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingProduct ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Product Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedProductForDelete(null);
          setHardDelete(false);
        }}
        title="Ürünü Sil"
      >
        <div className="space-y-4">
          <div className="p-4 bg-warning-50 rounded-lg border border-warning-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning-600 mt-0.5" />
              <div>
                <p className="font-medium text-warning-900 mb-1">Dikkat!</p>
                <p className="text-sm text-warning-700">
                  Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hardDelete}
                onChange={(e) => setHardDelete(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-secondary-900">
                Kalıcı olarak sil (Hard Delete)
              </span>
            </label>
            <p className="text-xs text-secondary-500 ml-6">
              {hardDelete
                ? 'Ürün veritabanından tamamen silinecek. Bu işlem geri alınamaz!'
                : 'Ürün devre dışı bırakılacak ancak veritabanında kalacak.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteModalOpen(false);
                setSelectedProductForDelete(null);
                setHardDelete(false);
              }}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (selectedProductForDelete) {
                  deleteMutation.mutate(selectedProductForDelete);
                }
              }}
              isLoading={deleteMutation.isPending}
            >
              {hardDelete ? 'Kalıcı Olarak Sil' : 'Sil'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Match Product Modal */}
      <Modal
        isOpen={matchModalOpen}
        onClose={() => {
          setMatchModalOpen(false);
          setSelectedProductForMatch(null);
          resetMatch();
        }}
        title="Marketplace Eşleştir"
        size="md"
      >
        {selectedProductForMatch && (
          <form
            onSubmit={handleSubmitMatch((data) => {
              matchMutation.mutate({ productId: selectedProductForMatch.id, data });
            })}
            className="space-y-5"
          >
            <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
              <p className="text-sm font-medium text-primary-900 mb-1">Ürün Bilgisi</p>
              <p className="text-sm text-primary-700">{selectedProductForMatch.name}</p>
              <p className="text-xs text-primary-600">SKU: {selectedProductForMatch.sku}</p>
            </div>

            <Select
              label="Entegrasyon *"
              options={[
                { value: '', label: 'Entegrasyon seçin' },
                ...(integrationsData?.data || [])
                  .filter((int: any) => int.status === 'ACTIVE')
                  .map((int: any) => ({
                    value: int.id,
                    label: `${int.name} (${int.type})`,
                  })),
              ]}
              placeholder="Entegrasyon seçin"
              error={errorsMatch.integrationId?.message}
              {...registerMatch('integrationId', { required: 'Entegrasyon seçin' })}
            />

            <Input
              label="Marketplace Product ID *"
              placeholder="Marketplace'deki ürün ID'si"
              hint="Marketplace'deki ürünün benzersiz ID'si (ör: WooCommerce product ID, Trendyol barcode, vs.)"
              error={errorsMatch.marketplaceProductId?.message}
              {...registerMatch('marketplaceProductId', { required: 'Marketplace product ID gerekli' })}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Marketplace SKU"
                placeholder="Opsiyonel"
                error={errorsMatch.sku?.message}
                {...registerMatch('sku')}
              />
              <Input
                label="Barkod"
                placeholder="Opsiyonel"
                error={errorsMatch.barcode?.message}
                {...registerMatch('barcode')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Fiyat"
                type="number"
                step="0.01"
                placeholder="Opsiyonel"
                error={errorsMatch.price?.message}
                {...registerMatch('price')}
              />
              <Input
                label="Ürün Linki"
                type="url"
                placeholder="https://..."
                error={errorsMatch.listingUrl?.message}
                {...registerMatch('listingUrl')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMatchModalOpen(false);
                  setSelectedProductForMatch(null);
                  resetMatch();
                }}
              >
                İptal
              </Button>
              <Button type="submit" isLoading={matchMutation.isPending}>
                Eşleştir
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Merge Product Modal */}
      <Modal
        isOpen={mergeModalOpen}
        onClose={() => {
          setMergeModalOpen(false);
          setSelectedProductForMerge(null);
        }}
        title="Ürün Birleştir"
        size="md"
      >
        {selectedProductForMerge && (
          <div className="space-y-5">
            <div className="p-4 bg-warning-50 rounded-lg border border-warning-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
                <div>
                  <p className="font-medium text-warning-900 mb-1">Dikkat!</p>
                  <p className="text-sm text-warning-700">
                    Bu işlem geri alınamaz. Seçtiğiniz ürün, başka bir ürünle birleştirilecek.
                    Birleştirme işlemi şunları yapar:
                  </p>
                  <ul className="text-sm text-warning-700 mt-2 list-disc list-inside space-y-1">
                    <li>Stoklar birleştirilir (toplanır)</li>
                    <li>Sipariş öğeleri taşınır</li>
                    <li>Marketplace bağlantıları taşınır</li>
                    <li>Diğer kayıtlar taşınır</li>
                    <li>Duplicate ürün silinir</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
                <p className="text-sm font-medium text-primary-900 mb-2">Birleştirilecek Ürün (Duplicate)</p>
                <p className="text-sm text-primary-700">{selectedProductForMerge.name}</p>
                <p className="text-xs text-primary-600">SKU: {selectedProductForMerge.sku}</p>
                {selectedProductForMerge.barcode && (
                  <p className="text-xs text-primary-600">Barkod: {selectedProductForMerge.barcode}</p>
                )}
              </div>

              <div className="text-center py-2">
                <GitMerge className="w-5 h-5 text-secondary-400 mx-auto" />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Master Ürün (Birleştirilecek ürün bu ürüne taşınacak) *
                </label>
                <select
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    if (selectedId) {
                      mergeMutation.mutate({
                        masterProductId: selectedId,
                        duplicateProductId: selectedProductForMerge.id,
                      });
                    }
                  }}
                  disabled={mergeMutation.isPending}
                >
                  <option value="">Master ürün seçin</option>
                  {products
                    .filter((p: Product) => p.id !== selectedProductForMerge.id)
                    .map((p: Product) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (SKU: {p.sku}{p.barcode ? `, Barkod: ${p.barcode}` : ''})
                      </option>
                    ))}
                </select>
                <p className="mt-1.5 text-xs text-secondary-500">
                  Duplicate ürün bu ürüne birleştirilecek. Master ürünün bilgileri korunur.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMergeModalOpen(false);
                  setSelectedProductForMerge(null);
                }}
                disabled={mergeMutation.isPending}
              >
                İptal
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Warehouse Management Modal */}
      <Modal
        isOpen={warehouseModalOpen}
        onClose={() => {
          setWarehouseModalOpen(false);
          setSelectedProductForWarehouse(null);
        }}
        title="Depo Stok Yönetimi"
        size="xl"
      >
        {selectedProductForWarehouse && (
          <ProductWarehouseManagement
            productId={selectedProductForWarehouse}
            onClose={() => {
              setWarehouseModalOpen(false);
              setSelectedProductForWarehouse(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ===== CAMPAIGN SETS TAB CONTENT =====
const campaignSetSchema = z.object({
  name: z.string().min(1, 'Set adı gerekli'),
  sku: z.string().min(1, 'SKU gerekli'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Fiyat pozitif olmalı'),
  items: z.array(z.object({
    productId: z.string().uuid('Geçersiz ürün ID'),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().positive('Miktar pozitif olmalı'),
  })).min(1, 'En az bir ürün eklenmeli'),
});

const createStockSchema = z.object({
  warehouseId: z.string().uuid('Geçersiz depo ID').refine(val => val !== '', 'Depo seçilmelidir'),
  locationId: z.union([z.string().uuid(), z.literal('')]).optional(),
  setQuantity: z.coerce.number().int().positive('Set miktarı pozitif olmalı'),
});

type CampaignSetForm = z.infer<typeof campaignSetSchema>;
type CreateStockForm = z.infer<typeof createStockSchema>;

function CampaignSetsTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [editingSet, setEditingSet] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formItems, setFormItems] = useState<Array<{ productId: string; variantId?: string; quantity: number }>>([]);

  const { data: setsData, isLoading } = useQuery({
    queryKey: ['campaign-sets', page, search],
    queryFn: () => api.getCampaignSets({ page, limit: 20, search }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.getProducts({ page: 1, limit: 1000 }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CampaignSetForm>({
    resolver: zodResolver(campaignSetSchema),
    defaultValues: {
      items: [],
    },
  });

  const stockForm = useForm<CreateStockForm>({
    resolver: zodResolver(createStockSchema),
  });

  const sets = setsData?.data || [];
  const products = productsData?.data || [];
  const warehouses = warehousesData?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCampaignSet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-sets'] });
      toast.success('Kampanyalı set oluşturuldu');
      setIsModalOpen(false);
      reset();
      setFormItems([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kampanyalı set oluşturulamadı');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateCampaignSet(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-sets'] });
      toast.success('Kampanyalı set güncellendi');
      setIsModalOpen(false);
      setEditingSet(null);
      reset();
      setFormItems([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kampanyalı set güncellenemedi');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaignSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-sets'] });
      toast.success('Kampanyalı set silindi');
    },
  });

  const createStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.createCampaignStock(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-sets'] });
      toast.success('Kampanya stoğu oluşturuldu');
      setIsStockModalOpen(false);
      stockForm.reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kampanya stoğu oluşturulamadı');
    },
  });

  const onSubmit = (data: CampaignSetForm) => {
    const submitData = {
      ...data,
      items: data.items,
    };

    if (editingSet) {
      updateMutation.mutate({ id: editingSet.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const onStockSubmit = (data: CreateStockForm) => {
    if (!selectedSet) return;
    const submitData = {
      ...data,
      locationId: data.locationId && data.locationId.trim() !== '' ? data.locationId : undefined,
    };
    createStockMutation.mutate({ id: selectedSet.id, data: submitData });
  };

  const addItem = () => {
    setFormItems([...formItems, { productId: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    const newItems = formItems.filter((_, i) => i !== index);
    setFormItems(newItems);
    const validItems = newItems.filter(item => item.productId && item.productId.trim() !== '');
    setValue('items', validItems, { shouldValidate: true });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormItems(newItems);
    const validItems = newItems.filter(item => item.productId && item.productId.trim() !== '');
    setValue('items', validItems, { shouldValidate: true });
  };

  const openEditModal = (set: any) => {
    setEditingSet(set);
    const items = set.items || [];
    setFormItems(items);
    setValue('name', set.name);
    setValue('sku', set.sku);
    setValue('description', set.description || '');
    setValue('price', Number(set.price));
    setValue('items', items, { shouldValidate: true });
    setIsModalOpen(true);
  };

  const openCreateStockModal = (set: any) => {
    setSelectedSet(set);
    setIsStockModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <Input
                placeholder="Set adı veya SKU ile ara..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Button onClick={() => {
              setIsModalOpen(true);
              setEditingSet(null);
              reset();
              setFormItems([]);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Yeni Set
            </Button>
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
          ) : sets.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Set Adı</TableHeader>
                  <TableHeader>SKU</TableHeader>
                  <TableHeader>Ürün Sayısı</TableHeader>
                  <TableHeader>Fiyat</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader className="w-12">{''}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {sets.map((set: any) => (
                  <TableRow key={set.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-secondary-900">{set.name}</p>
                        {set.description && (
                          <p className="text-sm text-secondary-500">{set.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-secondary-100 px-2 py-1 rounded">
                        {set.sku}
                      </code>
                    </TableCell>
                    <TableCell>{set.items?.length || 0} ürün</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(set.price)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={set.isActive ? 'success' : 'secondary'}>
                        {set.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedSet(set);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(set)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Bu seti silmek istediğinize emin misiniz?')) {
                              deleteMutation.mutate(set.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
              <p className="text-secondary-500 mb-4">Henüz kampanyalı set yok</p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Setinizi Oluşturun
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSet(null);
          reset();
          setFormItems([]);
        }}
        title={editingSet ? 'Seti Düzenle' : 'Yeni Kampanyalı Set'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Set Adı *"
            placeholder="Örn: 3'lü Set"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="SKU *"
            placeholder="SET-001"
            error={errors.sku?.message}
            {...register('sku')}
          />

          <Input
            label="Açıklama"
            placeholder="Set açıklaması"
            {...register('description')}
          />

          <Input
            label="Set Fiyatı *"
            type="number"
            step="0.01"
            placeholder="0.00"
            error={errors.price?.message}
            {...register('price')}
          />

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Set İçeriği *
            </label>
            <div className="space-y-3">
              {formItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2 p-3 border border-secondary-200 rounded-lg">
                  <Select
                    value={item.productId}
                    onChange={(e) => updateItem(index, 'productId', e.target.value)}
                    options={[
                      { value: '', label: 'Ürün seçin' },
                      ...products.map((p: any) => ({ value: p.id, label: `${p.name} (${p.sku})` })),
                    ]}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-24"
                    placeholder="Adet"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addItem}>
                <Plus className="w-4 h-4 mr-2" />
                Ürün Ekle
              </Button>
            </div>
            {errors.items && (
              <p className="text-sm text-red-600 mt-1">{errors.items.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setEditingSet(null);
                reset();
                setFormItems([]);
              }}
            >
              İptal
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingSet ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedSet(null);
        }}
        title={`${selectedSet?.name || 'Set'} Detayı`}
        size="lg"
      >
        {selectedSet && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-secondary-900 mb-2">Set Bilgileri</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">SKU:</span> {selectedSet.sku}</p>
                <p><span className="font-medium">Fiyat:</span> {formatCurrency(selectedSet.price)}</p>
                {selectedSet.description && (
                  <p><span className="font-medium">Açıklama:</span> {selectedSet.description}</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-medium text-secondary-900 mb-2">Set İçeriği</h3>
              <div className="space-y-2">
                {selectedSet.items?.map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-secondary-50 rounded">
                    <span className="text-sm">
                      {item.product?.name || 'Ürün'} ({item.product?.sku || 'SKU'})
                      {item.variant && ` - ${item.variant.name}`}
                    </span>
                    <Badge variant="secondary">{item.quantity} adet</Badge>
                  </div>
                ))}
              </div>
            </div>

            {selectedSet.stocks && selectedSet.stocks.length > 0 && (
              <div>
                <h3 className="font-medium text-secondary-900 mb-2">Stok Durumu</h3>
                <div className="space-y-2">
                  {selectedSet.stocks.map((stock: any) => (
                    <div key={stock.id} className="flex items-center justify-between p-2 bg-secondary-50 rounded">
                      <span className="text-sm">
                        {stock.warehouse?.name} {stock.location && `- ${stock.location.code}`}
                      </span>
                      <Badge variant="success">{stock.quantity} adet</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  openCreateStockModal(selectedSet);
                }}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Stok Oluştur
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Stock Modal */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          stockForm.reset();
        }}
        title="Kampanya Stoğu Oluştur"
      >
        <form onSubmit={stockForm.handleSubmit(onStockSubmit)} className="space-y-5">
          <Select
            label="Depo *"
            options={[
              { value: '', label: 'Depo seçin' },
              ...warehouses.map((w: any) => ({ value: w.id, label: w.name })),
            ]}
            {...stockForm.register('warehouseId')}
            error={stockForm.formState.errors.warehouseId?.message}
          />

          <Input
            label="Set Miktarı *"
            type="number"
            min="1"
            placeholder="50"
            {...stockForm.register('setQuantity')}
            error={stockForm.formState.errors.setQuantity?.message}
            hint="Kaç adet set oluşturulacak? Her üründen bu miktar kadar stok düşecek."
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsStockModalOpen(false);
                stockForm.reset();
              }}
            >
              İptal
            </Button>
            <Button type="submit" disabled={createStockMutation.isPending}>
              Oluştur
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function Products() {
  const [activeTab, setActiveTab] = useState<'products' | 'campaign-sets'>('products');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Ürünler</h1>
          <p className="text-secondary-500">Ürünlerinizi ve kampanyalı setlerinizi yönetin</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('products')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'products'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <Package className="w-4 h-4" />
            Ürünler
          </button>
          <button
            onClick={() => setActiveTab('campaign-sets')}
            className={cn(
              'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
              activeTab === 'campaign-sets'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
            )}
          >
            <Gift className="w-4 h-4" />
            Kampanyalı Setler
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'products' ? <ProductsTab /> : <CampaignSetsTab />}
    </div>
  );
}
