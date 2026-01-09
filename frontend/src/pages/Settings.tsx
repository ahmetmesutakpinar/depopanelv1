import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Globe,
  Key,
  Store,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  FileText,
  Clock,
  Package,
  CheckCircle2,
  Info,
  Star,
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
import api from '@/services/api';

// Marketplace types
const MARKETPLACE_TYPES = [
  { value: 'WOOCOMMERCE', label: 'WooCommerce', fields: ['apiUrl', 'apiKey', 'apiSecret'] },
  { value: 'TRENDYOL', label: 'Trendyol', fields: ['apiKey', 'apiSecret', 'sellerId'] },
  { value: 'HEPSIBURADA', label: 'Hepsiburada', fields: ['apiUrl', 'username', 'password', 'merchantId'] },
  { value: 'N11', label: 'N11', fields: ['apiKey', 'apiSecret'] },
  { value: 'PAZARAMA', label: 'Pazarama', fields: ['apiKey', 'apiSecret', 'sellerId'] },
  { value: 'AMAZON', label: 'Amazon', fields: ['apiKey', 'apiSecret', 'sellerId', 'marketplaceId'] },
  { value: 'SHOPIFY', label: 'Shopify', fields: ['apiUrl', 'accessToken'] },
  { value: 'IKAS', label: 'Ikas', fields: ['apiUrl', 'apiKey', 'apiSecret'] },
];

const integrationSchema = z.object({
  type: z.string().min(1, 'Pazaryeri seçin'),
  name: z.string().min(2, 'Entegrasyon adı gerekli'),
  apiUrl: z.string().url('Geçerli URL girin').optional().or(z.literal('')),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  sellerId: z.string().optional(),
  merchantId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  accessToken: z.string().optional(),
  marketplaceId: z.string().optional(),
  readOnly: z.boolean().optional(),
});

type IntegrationForm = z.infer<typeof integrationSchema>;

interface Integration {
  id: string;
  type: string;
  name: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  lastSyncAt?: string;
  createdAt: string;
  settings?: {
    readOnly?: boolean;
    merchantId?: string;
    username?: string;
    password?: string;
    marketplaceId?: string;
  };
}

interface SyncLog {
  id: string;
  type: string;
  marketplace: string;
  status: string;
  message?: string;
  recordsProcessed: number;
  recordsFailed: number;
  createdAt: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [selectedType, setSelectedType] = useState('');
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [isClearPasswordModalOpen, setIsClearPasswordModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.getIntegrations(),
    retry: false, // Hata durumunda tekrar deneme
    refetchOnWindowFocus: false, // Pencere odaklandığında tekrar çekme
    onError: () => {
      // Hata durumunu sessizce handle et, toast gösterme
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<IntegrationForm>({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      readOnly: false,
    },
  });

  const watchType = watch('type');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Entegrasyon eklendi');
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Entegrasyon eklenemedi');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateIntegration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Entegrasyon güncellendi');
      setIsModalOpen(false);
      setEditingIntegration(null);
      reset();
    },
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedIntegrationForDelete, setSelectedIntegrationForDelete] = useState<string | null>(null);
  const [hardDelete, setHardDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: ({ id, hardDelete, cleanup }: { id: string; hardDelete?: boolean; cleanup?: boolean }) => 
      api.deleteIntegration(id, { hardDelete, cleanup }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(variables.hardDelete ? 'Entegrasyon kalıcı olarak silindi' : 'Entegrasyon silindi');
      setDeleteModalOpen(false);
      setSelectedIntegrationForDelete(null);
      setHardDelete(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Entegrasyon silinemedi');
    },
  });

  const clearActiveMutation = useMutation({
    mutationFn: (password: string) => api.clearActiveIntegrations(password),
    onSuccess: (data: any) => {
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-sets'] });
      queryClient.invalidateQueries({ queryKey: ['picking-waves'] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      
      // Remove all cached data to force fresh fetch
      queryClient.removeQueries({ queryKey: ['orders'] });
      queryClient.removeQueries({ queryKey: ['products'] });
      queryClient.removeQueries({ queryKey: ['integrations'] });
      
      const result = data.data || {};
      const message = `${result.deletedCount || 0} aktif entegrasyon, ${result.deletedOrders || 0} sipariş, ${result.deletedProducts || 0} ürün ve ${result.deletedSyncLogs || 0} senkronizasyon logu silindi`;
      toast.success(message);
      setIsClearPasswordModalOpen(false);
      setClearPassword('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Aktif entegrasyonlar silinemedi');
    },
  });

  const cleanupOrphansMutation = useMutation({
    mutationFn: () => api.cleanupOrphans(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      const result = data.data || {};
      const message = result.totalDeleted > 0
        ? `${result.totalDeleted} kalıntı kayıt temizlendi (${result.productSources?.deleted || 0} ProductSource, ${result.orderSources?.deleted || 0} OrderSource)`
        : 'Temizlenecek kalıntı kayıt bulunamadı';
      toast.success(message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kalıntı kayıtlar temizlenemedi');
    },
  });


  const syncMutation = useMutation({
    mutationFn: (id: string) => api.syncIntegration(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Senkronizasyon başlatıldı');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      // Invalidate all related queries that might be affected by sync
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-logs'] });
      
      // ✅ OTOMATIK REFRESH: Senkronizasyon tamamlandıktan sonra sayfayı yenile
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['returns'] });
        if (selectedIntegrationId) {
          queryClient.invalidateQueries({ queryKey: ['integration-logs', selectedIntegrationId] });
        }
        // Sayfayı yenile
        window.location.reload();
      }, 5000); // Increased delay to allow sync to complete
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Senkronizasyon başlatılamadı');
    },
  });

  const manualSyncMutation = useMutation({
    mutationFn: (id: string) => api.manualSyncIntegration(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Manuel senkronizasyon başlatıldı');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Manuel senkronizasyon başlatılamadı');
    },
  });

  // Fetch sync logs
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['integration-logs', selectedIntegrationId],
    queryFn: () => api.getIntegrationLogs(selectedIntegrationId!),
    enabled: !!selectedIntegrationId && logsModalOpen,
  });

  const openLogsModal = (integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    setLogsModalOpen(true);
  };

  const onSubmit = (data: IntegrationForm) => {
    const payload = {
      type: data.type,
      name: data.name,
      apiUrl: data.apiUrl || null,
      apiKey: data.apiKey || null,
      apiSecret: data.apiSecret || null,
      sellerId: data.sellerId || null,
      accessToken: data.accessToken || null,
      settings: {
        merchantId: data.merchantId,
        username: data.username,
        password: data.password,
        marketplaceId: data.marketplaceId,
        readOnly: data.readOnly || false,
      },
    };

    console.log('Payload:', payload);

    if (editingIntegration) {
      updateMutation.mutate({ id: editingIntegration.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEditModal = (integration: Integration) => {
    setEditingIntegration(integration);
    setSelectedType(integration.type);
    reset({
      type: integration.type,
      name: integration.name,
      apiUrl: integration.apiUrl || '',
      apiKey: integration.apiKey || '',
      apiSecret: integration.apiSecret || '',
      sellerId: integration.sellerId || '',
      readOnly: integration.settings?.readOnly || false,
    });
    setIsModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Aktif</Badge>;
      case 'ERROR':
        return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Hata</Badge>;
      default:
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Pasif</Badge>;
    }
  };

  const getMarketplaceFields = (type: string) => {
    return MARKETPLACE_TYPES.find(m => m.value === type)?.fields || [];
  };

  const integrations = (integrationsData?.data || []) as Integration[];
  const activeIntegrationsCount = integrations.filter((i) => i.status === 'ACTIVE').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Ayarlar</h1>
          <p className="text-secondary-500">Pazaryeri entegrasyonlarını yönetin</p>
        </div>
      </div>

      {/* Integrations Section */}
      <Card>
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-secondary-900">Pazaryeri Entegrasyonları</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={() => cleanupOrphansMutation.mutate()}
              isLoading={cleanupOrphansMutation.isPending}
              title="Silinmiş entegrasyonlardan kalan kalıntı kayıtları temizler (ProductSource, OrderSource)"
            >
              Kalıntıları Temizle
            </Button>
            {activeIntegrationsCount > 0 && (
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Trash2 className="w-4 h-4" />}
                onClick={() => setIsClearPasswordModalOpen(true)}
                title="Tüm aktif entegrasyonları siler"
              >
                Aktif Entegrasyonları Temizle ({activeIntegrationsCount})
              </Button>
            )}
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditingIntegration(null);
                setSelectedType('');
                reset({
                  type: '',
                  name: '',
                  apiUrl: '',
                  apiKey: '',
                  apiSecret: '',
                  sellerId: '',
                  readOnly: false,
                });
                setIsModalOpen(true);
              }}
            >
              Entegrasyon Ekle
            </Button>
          </div>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : integrations.length > 0 ? (
            <div className="divide-y divide-secondary-100">
              {integrations.map((integration: Integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 hover:bg-secondary-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                      <Store className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-secondary-900">{integration.name}</h3>
                        {getStatusBadge(integration.status)}
                        {integration.settings?.readOnly && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Sadece Okuma
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-secondary-500">
                        {MARKETPLACE_TYPES.find(m => m.value === integration.type)?.label || integration.type}
                        {integration.lastSyncAt && (
                          <span className="ml-2">
                            • Son sync: {new Date(integration.lastSyncAt).toLocaleString('tr-TR')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => syncMutation.mutate(integration.id)}
                      disabled={syncMutation.isPending}
                      title="Senkronize Et"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openLogsModal(integration.id)}
                      title="Sync Loglarını Görüntüle"
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(integration)}
                      title="Düzenle"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedIntegrationForDelete(integration.id);
                        setDeleteModalOpen(true);
                      }}
                      className="text-danger-600 hover:bg-danger-50"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-12">
              <Globe className="w-16 h-16 text-secondary-300 mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Entegrasyon bulunamadı
              </h3>
              <p className="text-secondary-500 mb-4">
                Pazaryeri entegrasyonu ekleyerek başlayın
              </p>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                İlk Entegrasyonu Ekle
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Kargo Entegrasyonları - Navlungo */}
      <Card>
        <div className="card-header">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-secondary-900">Kargo Entegrasyonları</h2>
          </div>
        </div>
        <CardBody>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-secondary-900">Navlungo</h3>
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Aktif
                  </Badge>
                </div>
                <p className="text-sm text-secondary-600 mb-4">
                  Navlungo entegrasyonu WooCommerce üzerinden pasif olarak çalışmaktadır. 
                  DepoPanel hiçbir zaman Navlungo'ya sipariş göndermez, sadece WooCommerce 
                  siparişlerinden gelen gönderi bilgilerini okur.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-secondary-700">
                    <CheckCircle2 className="w-4 h-4 text-success-600 mt-0.5 flex-shrink-0" />
                    <span>WooCommerce üzerinden aktif</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-secondary-700">
                    <CheckCircle2 className="w-4 h-4 text-success-600 mt-0.5 flex-shrink-0" />
                    <span>Sipariş barkodu sistemi aktif</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-secondary-700">
                    <CheckCircle2 className="w-4 h-4 text-success-600 mt-0.5 flex-shrink-0" />
                    <span>DepoPanel hiçbir veri göndermez (sadece okuma)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-secondary-700">
                    <CheckCircle2 className="w-4 h-4 text-success-600 mt-0.5 flex-shrink-0" />
                    <span>Sadece okuma modunda çalışır</span>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-800">
                      <strong>Nasıl Çalışır?</strong> Navlungo sipariş için barkod üretir ve 
                      WooCommerce siparişine metadata olarak ekler. DepoPanel cron job'u 
                      (15 dakika) ile siparişleri çekerken bu metadata'yı da alır. Depocu 
                      sipariş kağıdındaki barkodu okutunca, DepoPanel siparişi bulup otomatik 
                      açar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Integration Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingIntegration(null);
        }}
        title={editingIntegration ? 'Entegrasyonu Düzenle' : 'Yeni Entegrasyon'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Select
            label="Pazaryeri *"
            options={MARKETPLACE_TYPES.map(m => ({ value: m.value, label: m.label }))}
            placeholder="Pazaryeri seçin"
            error={errors.type?.message}
            {...register('type', {
              onChange: (e) => setSelectedType(e.target.value)
            })}
          />

          <Input
            label="Entegrasyon Adı *"
            placeholder="Örn: Ana WooCommerce Mağazası"
            error={errors.name?.message}
            {...register('name')}
          />

          {/* Dynamic fields based on marketplace type */}
          {(selectedType || watchType) && (
            <div className="space-y-4 pt-4 border-t border-secondary-100">
              <h4 className="font-medium text-secondary-900 flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Bilgileri
              </h4>

              {getMarketplaceFields(selectedType || watchType).includes('apiUrl') && (
                <Input
                  label="API URL"
                  placeholder="https://example.com"
                  error={errors.apiUrl?.message}
                  {...register('apiUrl')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('apiKey') && (
                <Input
                  label="API Key"
                  placeholder="API anahtarınız"
                  type={showSecrets['apiKey'] ? 'text' : 'password'}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, apiKey: !prev.apiKey }))}
                    >
                      {showSecrets['apiKey'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('apiKey')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('apiSecret') && (
                <Input
                  label="API Secret"
                  placeholder="API gizli anahtarınız"
                  type={showSecrets['apiSecret'] ? 'text' : 'password'}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, apiSecret: !prev.apiSecret }))}
                    >
                      {showSecrets['apiSecret'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('apiSecret')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('sellerId') && (
                <Input
                  label="Satıcı ID (Seller ID)"
                  placeholder="Satıcı numaranız"
                  {...register('sellerId')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('merchantId') && (
                <Input
                  label="Merchant ID"
                  placeholder="Mağaza numaranız"
                  {...register('merchantId')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('username') && (
                <Input
                  label="Kullanıcı Adı"
                  placeholder="API kullanıcı adı"
                  {...register('username')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('password') && (
                <Input
                  label="Şifre"
                  placeholder="API şifresi"
                  type={showSecrets['password'] ? 'text' : 'password'}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, password: !prev.password }))}
                    >
                      {showSecrets['password'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('password')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('accessToken') && (
                <Input
                  label="Access Token"
                  placeholder="Erişim tokenınız"
                  type={showSecrets['accessToken'] ? 'text' : 'password'}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, accessToken: !prev.accessToken }))}
                    >
                      {showSecrets['accessToken'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('accessToken')}
                />
              )}

              {getMarketplaceFields(selectedType || watchType).includes('marketplaceId') && (
                <Input
                  label="Marketplace ID"
                  placeholder="Amazon marketplace ID"
                  {...register('marketplaceId')}
                />
              )}
            </div>
          )}

          {/* API Yetki Ayarları */}
          <div className="space-y-4 pt-4 border-t border-secondary-100">
            <h4 className="font-medium text-secondary-900 flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Yetki Ayarları
            </h4>
            <div className="bg-secondary-50 p-4 rounded-lg border border-secondary-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500 focus:ring-2"
                  {...register('readOnly')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-4 h-4 text-secondary-600" />
                    <span className="font-medium text-secondary-900">Sadece Okuma (Read-Only)</span>
                  </div>
                  <p className="text-sm text-secondary-600">
                    Bu seçenek aktif olduğunda, entegrasyon sadece veri çekecek (siparişler, ürünler) ancak 
                    pazaryerindeki stokları güncellemeyecek. Stoklar sadece okunacak ve sistemdeki stoklarla 
                    karşılaştırılacak.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setEditingIntegration(null);
              }}
            >
              İptal
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingIntegration ? 'Güncelle' : 'Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Sync Logs Modal */}
      <Modal
        isOpen={logsModalOpen}
        onClose={() => {
          setLogsModalOpen(false);
          setSelectedIntegrationId(null);
        }}
        title="Senkronizasyon Logları"
        size="lg"
      >
        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
            <span className="ml-2 text-secondary-600">Loglar yükleniyor...</span>
          </div>
        ) : logsData?.data && logsData.data.length > 0 ? (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {logsData.data.map((log: SyncLog) => (
              <div
                key={log.id}
                className={`p-4 rounded-lg border ${
                  log.status === 'SUCCESS'
                    ? 'bg-success-50 border-success-200'
                    : log.status === 'FAILED'
                    ? 'bg-danger-50 border-danger-200'
                    : 'bg-warning-50 border-warning-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {log.status === 'SUCCESS' ? (
                      <CheckCircle className="w-5 h-5 text-success-600" />
                    ) : log.status === 'FAILED' ? (
                      <XCircle className="w-5 h-5 text-danger-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-warning-600" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            log.status === 'SUCCESS'
                              ? 'success'
                              : log.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {log.status}
                        </Badge>
                        <span className="text-sm font-medium text-secondary-900">
                          {log.type === 'ORDER_SYNC' ? 'Sipariş Sync' : 'Stok Sync'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-secondary-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(log.createdAt).toLocaleString('tr-TR')}
                        </span>
                        {log.recordsProcessed > 0 && (
                          <span className="text-success-600">
                            {log.recordsProcessed} başarılı
                          </span>
                        )}
                        {log.recordsFailed > 0 && (
                          <span className="text-danger-600">
                            {log.recordsFailed} hata
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {log.message && (
                  <p className="text-sm text-secondary-700 mt-2">{log.message}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state py-12">
            <FileText className="w-16 h-16 text-secondary-300 mb-4" />
            <h3 className="text-lg font-medium text-secondary-900 mb-2">
              Log bulunamadı
            </h3>
            <p className="text-secondary-500">
              Bu entegrasyon için henüz senkronizasyon logu yok.
            </p>
          </div>
        )}
      </Modal>

      {/* Clear Active Integrations Password Modal */}
      <Modal
        isOpen={isClearPasswordModalOpen}
        onClose={() => {
          setIsClearPasswordModalOpen(false);
          setClearPassword('');
        }}
        title="Aktif Entegrasyonları Temizle"
      >
        <div className="space-y-4">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Uyarı:</strong> Bu işlem tüm aktif entegrasyonları kalıcı olarak silecektir. 
              Bu işlem geri alınamaz!
            </p>
          </div>

          <Input
            label="Giriş Şifreniz *"
            type="password"
            placeholder="Giriş yaparken kullandığınız şifreyi girin"
            value={clearPassword}
            onChange={(e) => setClearPassword(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={() => {
                setIsClearPasswordModalOpen(false);
                setClearPassword('');
              }}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!clearPassword) {
                  toast.error('Şifre girin');
                  return;
                }
                clearActiveMutation.mutate(clearPassword);
              }}
              disabled={clearActiveMutation.isPending}
            >
              {clearActiveMutation.isPending ? 'Siliniyor...' : 'Temizle'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Integration Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedIntegrationForDelete(null);
          setHardDelete(false);
        }}
        title="Entegrasyonu Sil"
      >
        <div className="space-y-4">
          <div className="p-4 bg-warning-50 rounded-lg border border-warning-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning-600 mt-0.5" />
              <div>
                <p className="font-medium text-warning-900 mb-1">Dikkat!</p>
                <p className="text-sm text-warning-700">
                  Bu entegrasyonu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
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
                ? 'Entegrasyon veritabanından tamamen silinecek. Bu işlem geri alınamaz!'
                : 'Entegrasyon devre dışı bırakılacak ancak veritabanında kalacak.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-100">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteModalOpen(false);
                setSelectedIntegrationForDelete(null);
                setHardDelete(false);
              }}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (selectedIntegrationForDelete) {
                  deleteMutation.mutate({
                    id: selectedIntegrationForDelete,
                    hardDelete,
                    cleanup: true, // Always cleanup related data
                  });
                }
              }}
              isLoading={deleteMutation.isPending}
            >
              {hardDelete ? 'Kalıcı Olarak Sil' : 'Sil'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

