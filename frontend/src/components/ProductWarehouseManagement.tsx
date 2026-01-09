import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Warehouse,
  Package,
  Plus,
  Edit,
  Trash2,
  MapPin,
  AlertCircle,
  X,
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
import { formatNumber } from '@/utils';
import api from '@/services/api';

const stockFormSchema = z.object({
  quantity: z.coerce.number().int().min(0, 'Miktar 0 veya pozitif olmalı'),
  minQuantity: z.coerce.number().int().min(0).optional(),
  locationId: z.string().uuid().optional(),
  note: z.string().optional(),
});

type StockForm = z.infer<typeof stockFormSchema>;

interface ProductWarehouseManagementProps {
  productId: string;
  onClose?: () => void;
}

export default function ProductWarehouseManagement({
  productId,
  onClose,
}: ProductWarehouseManagementProps) {
  const queryClient = useQueryClient();
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<{
    warehouseId: string;
    stock: any;
  } | null>(null);

  // Fetch product warehouses
  const { data: warehousesData, isLoading } = useQuery({
    queryKey: ['product-warehouses', productId],
    queryFn: () => api.getProductWarehouses(productId),
  });

  // Fetch active warehouses for dropdown
  const { data: activeWarehousesData } = useQuery({
    queryKey: ['activeWarehouses'],
    queryFn: () => api.getActiveWarehouses(),
  });

  const warehouses = warehousesData?.data || [];
  const activeWarehouses = activeWarehousesData?.data || [];

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StockForm>({
    resolver: zodResolver(stockFormSchema),
    defaultValues: {
      quantity: 0,
      minQuantity: 0,
    },
  });

  const createOrUpdateStockMutation = useMutation({
    mutationFn: ({ warehouseId, data }: { warehouseId: string; data: StockForm }) =>
      api.createOrUpdateProductStock(productId, warehouseId, {
        quantity: data.quantity,
        minQuantity: data.minQuantity,
        locationId: data.locationId,
        note: data.note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-warehouses', productId] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stok güncellendi');
      setIsStockModalOpen(false);
      setEditingStock(null);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Stok güncellenemedi');
    },
  });

  const deleteStockMutation = useMutation({
    mutationFn: (warehouseId: string) => api.deleteProductStock(productId, warehouseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-warehouses', productId] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stok kaydı silindi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Stok silinemedi');
    },
  });

  const openStockModal = (warehouseId?: string, stock?: any) => {
    if (warehouseId && stock) {
      setEditingStock({ warehouseId, stock });
      setSelectedWarehouseId('');
      reset({
        quantity: stock.quantity || 0,
        minQuantity: stock.minQuantity || 0,
        locationId: stock.locationId || undefined,
        note: '',
      });
    } else {
      setEditingStock(null);
      setSelectedWarehouseId('');
      reset({
        quantity: 0,
        minQuantity: 0,
        locationId: undefined,
        note: '',
      });
    }
    setIsStockModalOpen(true);
  };

  const onSubmitStock = (data: StockForm) => {
    const warehouseId = editingStock?.warehouseId || selectedWarehouseId;
    if (!warehouseId) {
      toast.error('Depo seçilmedi');
      return;
    }

    createOrUpdateStockMutation.mutate({ warehouseId, data });
  };

  const handleDeleteStock = (warehouseId: string, warehouseName: string) => {
    if (!confirm(`${warehouseName} deposundaki stok kaydını silmek istediğinize emin misiniz?`)) {
      return;
    }

    deleteStockMutation.mutate(warehouseId);
  };

  // Find warehouses that don't have stock yet
  const warehousesWithoutStock = activeWarehouses.filter(
    (w: any) => !warehouses.some((pw: any) => pw.warehouse.id === w.id)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Warehouse className="w-5 h-5" />
          Depo Stok Yönetimi
        </h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {warehouses.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Bu ürün için henüz stok kaydı bulunmuyor.</p>
              {warehousesWithoutStock.length > 0 && (
                <Button
                  className="mt-4"
                  onClick={() => openStockModal()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  İlk Stok Kaydını Oluştur
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Depo</TableHeader>
                    <TableHeader>Stok Miktarı</TableHeader>
                    <TableHeader>Rezerve</TableHeader>
                    <TableHeader>Min. Stok</TableHeader>
                    <TableHeader>Lokasyon</TableHeader>
                    <TableHeader>İşlemler</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {warehouses.map((item: any) => (
                    <TableRow key={item.warehouse.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{item.warehouse.name}</span>
                          {item.warehouse.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Varsayılan
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{item.warehouse.code}</div>
                      </TableCell>
                      <TableCell>
                        <span className={item.stock.quantity === 0 ? 'text-gray-400' : 'font-semibold'}>
                          {formatNumber(item.stock.quantity)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-orange-600">
                          {formatNumber(item.stock.reservedQty || 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-500">
                          {formatNumber(item.stock.minQuantity || 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.location ? (
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span>{item.location.code}</span>
                            {item.location.name && (
                              <span className="text-gray-500">({item.location.name})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openStockModal(item.warehouse.id, item.stock)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!item.warehouse.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteStock(item.warehouse.id, item.warehouse.name)}
                              className="text-red-600 hover:text-red-700"
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
            </CardBody>
          </Card>

          {warehousesWithoutStock.length > 0 && (
            <Card>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium mb-1">Stok Kaydı Olmayan Depolar</h4>
                    <p className="text-sm text-gray-500">
                      {warehousesWithoutStock.length} depoda stok kaydı yok
                    </p>
                  </div>
                  <Button onClick={() => openStockModal()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Yeni Stok Kaydı Ekle
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* Stock Create/Update Modal */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          setEditingStock(null);
          reset();
        }}
        title={editingStock ? 'Stok Güncelle' : 'Yeni Stok Kaydı'}
      >
        <form onSubmit={handleSubmit(onSubmitStock)} className="space-y-4">
          {!editingStock && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Depo <span className="text-red-500">*</span>
              </label>
              <Select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                error={!selectedWarehouseId ? 'Depo seçilmelidir' : undefined}
              >
                <option value="">Depo seçin</option>
                {warehousesWithoutStock.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.isDefault && '(Varsayılan)'}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Stok Miktarı <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              {...register('quantity')}
              error={errors.quantity?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Minimum Stok
            </label>
            <Input
              type="number"
              {...register('minQuantity')}
              error={errors.minQuantity?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Not
            </label>
            <Input
              type="text"
              {...register('note')}
              error={errors.note?.message}
              placeholder="Opsiyonel not"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsStockModalOpen(false);
                setEditingStock(null);
                reset();
              }}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={createOrUpdateStockMutation.isPending}
            >
              {editingStock ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

