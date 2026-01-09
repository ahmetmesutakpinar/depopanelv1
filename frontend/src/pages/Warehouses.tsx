import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse as WarehouseIcon,
  Plus,
  Edit,
  Trash2,
  Star,
  MapPin,
  Package,
  AlertTriangle,
  ShoppingCart,
  Eye,
  LayoutGrid,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Input,
  Modal,
  Badge,
  Card,
  CardBody,
} from '@/components/ui';
import { cn, formatNumber } from '@/utils';
import api from '@/services/api';
import type { Warehouse } from '@/utils/types';

const warehouseSchema = z.object({
  name: z.string().min(2, 'Depo adı en az 2 karakter olmalı'),
  code: z.string().min(2, 'Depo kodu en az 2 karakter olmalı').optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type WarehouseForm = z.infer<typeof warehouseSchema>;

interface WarehouseStats {
  totalStock: number;
  productCount: number;
  totalLocations: number;
  usedLocations: number;
  locationUsagePercent: number;
  lowStockCount: number;
  pendingOrderCount: number;
}

export default function Warehouses() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  const { data: warehousesData, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.getWarehouses(),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Tüm depoların istatistiklerini tek seferde getir
  const { data: allStatsData } = useQuery({
    queryKey: ['warehouse-stats-all'],
    queryFn: () => api.getAllWarehouseStats(),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseForm>({
    resolver: zodResolver(warehouseSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createWarehouse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats-all'] });
      toast.success('Depo oluşturuldu');
      setIsModalOpen(false);
      reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.updateWarehouse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Depo güncellendi');
      setIsModalOpen(false);
      setEditingWarehouse(null);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWarehouse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats-all'] });
      toast.success('Depo silindi');
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api.setDefaultWarehouse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Varsayılan depo ayarlandı');
    },
  });

  const onSubmit = (data: WarehouseForm) => {
    if (editingWarehouse) {
      updateMutation.mutate({ id: editingWarehouse.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditModal = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    reset({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address || '',
      city: warehouse.city || '',
      isDefault: warehouse.isDefault,
    });
    setIsModalOpen(true);
  };

  const warehouses = warehousesData?.data || [];
  const allStats = allStatsData?.data || {};

  const getStats = (warehouseId: string): WarehouseStats | null => {
    return allStats[warehouseId] || null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Depolar</h1>
          <p className="text-secondary-500">Depolarınızı yönetin ve stok takibi yapın</p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditingWarehouse(null);
            reset({
              name: '',
              code: '',
              address: '',
              city: '',
              isDefault: false,
            });
            setIsModalOpen(true);
          }}
        >
          Yeni Depo
        </Button>
      </div>

      {/* Warehouses Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : warehouses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {warehouses.map((warehouse: Warehouse) => {
            const stats = getStats(warehouse.id);
            
            return (
              <Card
                key={warehouse.id}
                className={cn(
                  'hover:shadow-lg transition-shadow cursor-pointer',
                  warehouse.isDefault && 'ring-2 ring-primary-500'
                )}
                onClick={() => navigate(`/locations?warehouse=${warehouse.id}`)}
              >
                <CardBody className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center',
                        warehouse.isDefault ? 'bg-primary-100' : 'bg-secondary-100'
                      )}>
                        <WarehouseIcon className={cn(
                          'w-6 h-6',
                          warehouse.isDefault ? 'text-primary-600' : 'text-secondary-500'
                        )} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-secondary-900">
                          {warehouse.name}
                        </h3>
                        <code className="text-xs bg-secondary-100 px-2 py-0.5 rounded">
                          {warehouse.code}
                        </code>
                      </div>
                    </div>
                    {warehouse.isDefault && (
                      <Badge variant="primary">
                        <Star className="w-3 h-3 mr-1" />
                        Varsayılan
                      </Badge>
                    )}
                  </div>

                  {/* Address */}
                  {(warehouse.address || warehouse.city) && (
                    <div className="flex items-start gap-2 text-sm text-secondary-500 mb-4">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>
                        {warehouse.address}
                        {warehouse.city && `, ${warehouse.city}`}
                      </span>
                    </div>
                  )}

                  {/* Stats */}
                  {stats && (
                    <div className="space-y-3 mb-4">
                      {/* Stok ve Ürün */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-secondary-50 rounded-lg">
                          <div className="flex items-center gap-2 text-secondary-600 mb-1">
                            <Package className="w-4 h-4" />
                            <span className="text-xs">Toplam Stok</span>
                          </div>
                          <p className="text-lg font-bold text-secondary-900">
                            {formatNumber(stats.totalStock)}
                          </p>
                        </div>
                        <div className="p-3 bg-secondary-50 rounded-lg">
                          <div className="flex items-center gap-2 text-secondary-600 mb-1">
                            <LayoutGrid className="w-4 h-4" />
                            <span className="text-xs">Ürün Çeşidi</span>
                          </div>
                          <p className="text-lg font-bold text-secondary-900">
                            {formatNumber(stats.productCount)}
                          </p>
                        </div>
                      </div>

                      {/* Lokasyon Doluluk */}
                      {stats.totalLocations > 0 && (
                        <div className="p-3 bg-secondary-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-secondary-600">
                              <MapPin className="w-4 h-4" />
                              <span className="text-xs">Lokasyon Doluluk</span>
                            </div>
                            <span className="text-xs font-medium text-secondary-700">
                              {stats.usedLocations} / {stats.totalLocations}
                            </span>
                          </div>
                          <div className="w-full bg-secondary-200 rounded-full h-2">
                            <div 
                              className={cn(
                                "h-2 rounded-full transition-all",
                                stats.locationUsagePercent > 90 ? 'bg-danger-500' : 
                                stats.locationUsagePercent > 70 ? 'bg-warning-500' : 'bg-success-500'
                              )}
                              style={{ width: `${stats.locationUsagePercent}%` }}
                            />
                          </div>
                          <p className="text-xs text-secondary-500 mt-1 text-right">
                            %{stats.locationUsagePercent} dolu
                          </p>
                        </div>
                      )}

                      {/* Uyarılar */}
                      <div className="flex items-center gap-3">
                        {stats.lowStockCount > 0 && (
                          <div className="flex items-center gap-1.5 text-warning-600 bg-warning-50 px-2 py-1 rounded-lg text-xs">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{stats.lowStockCount} kritik stok</span>
                          </div>
                        )}
                        {stats.pendingOrderCount > 0 && (
                          <div className="flex items-center gap-1.5 text-primary-600 bg-primary-50 px-2 py-1 rounded-lg text-xs">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>{stats.pendingOrderCount} bekleyen sipariş</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div 
                    className="flex items-center justify-between pt-4 border-t border-secondary-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={warehouse.isActive ? 'success' : 'secondary'}>
                        {warehouse.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/locations?warehouse=${warehouse.id}`)}
                        className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        title="Lokasyonları Görüntüle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {!warehouse.isDefault && (
                        <button
                          onClick={() => setDefaultMutation.mutate(warehouse.id)}
                          className="p-2 text-secondary-400 hover:text-warning-600 hover:bg-warning-50 rounded-lg"
                          title="Varsayılan yap"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(warehouse)}
                        className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {!warehouse.isDefault && (
                        <button
                          onClick={() => {
                            if (confirm('Bu depoyu silmek istediğinize emin misiniz?')) {
                              deleteMutation.mutate(warehouse.id);
                            }
                          }}
                          className="p-2 text-secondary-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardBody>
            <div className="empty-state py-12">
              <WarehouseIcon className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Depo bulunamadı
              </h3>
              <p className="text-secondary-500 mb-4">
                Henüz depo eklenmemiş
              </p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Deponuzu Ekleyin
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingWarehouse(null);
        }}
        title={editingWarehouse ? 'Depoyu Düzenle' : 'Yeni Depo'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Depo Adı *"
            placeholder="Ana Depo"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Depo Kodu"
            placeholder="ANA001"
            hint="Boş bırakılırsa otomatik oluşturulur"
            {...register('code')}
          />

          <Input
            label="Adres"
            placeholder="Sokak, bina no..."
            {...register('address')}
          />

          <Input
            label="Şehir"
            placeholder="İstanbul"
            {...register('city')}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              {...register('isDefault')}
            />
            <span className="text-sm text-secondary-700">Varsayılan depo olarak ayarla</span>
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setEditingWarehouse(null);
              }}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingWarehouse ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
