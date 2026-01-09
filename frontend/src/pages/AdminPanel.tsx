import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Search,
  AlertCircle,
  Activity,
  MessageSquare,
  Users,
  Package,
  ShoppingCart,
  Server,
  Plus,
  Mail,
  Phone,
  MapPin,
  FileText,
  User,
  Lock,
  Eye,
  Trash2,
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
  Tabs,
} from '@/components/ui';
import { formatDate, formatCurrency, cn } from '@/utils';
import api from '@/services/api';

type TabType = 'companies' | 'health' | 'tickets';

interface Company {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  taxNumber?: string;
  createdAt: string;
  admin?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  stats: {
    users: number;
    warehouses: number;
    products: number;
    orders: number;
  };
}

interface SystemHealth {
  database: {
    status: string;
    provider: string;
  };
  server: {
    uptime: number;
    nodeVersion: string;
    platform: string;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  companies: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    suspended: number;
  };
  users: {
    total: number;
    active: number;
    byRole: {
      staff: number;
      admin: number;
      superAdmin: number;
    };
  };
  orders: {
    total: number;
    today: number;
    last7Days: number;
    byStatus: {
      pending: number;
      processing: number;
      shipped: number;
      delivered: number;
    };
    totalRevenue: number;
  };
  inventory: {
    totalProducts: number;
    totalWarehouses: number;
    totalStock: number;
    lowStockProducts: number;
  };
  integrations: {
    active: number;
  };
  support: {
    open: number;
    resolved: number;
  };
}

interface Ticket {
  id: string;
  type: string;
  subject: string;
  message: string;
  status: string;
  email: string;
  companyName?: string;
  response?: string;
  createdAt: string;
  updatedAt: string;
}

const statusLabels: Record<string, string> = {
  PENDING: 'Bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  SUSPENDED: 'Askıya Alındı',
};

const statusBadgeVariants: Record<string, 'warning' | 'success' | 'danger' | 'secondary'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'secondary',
};

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('companies');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | 'suspend' | 'reactivate' | 'delete' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [selectedCompanyForUsers, setSelectedCompanyForUsers] = useState<Company | null>(null);
  const [createFormData, setCreateFormData] = useState({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
    taxNumber: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhone: '',
    autoApprove: false,
  });

  // Fetch companies
  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ['admin-companies', statusFilter, search],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search) params.search = search;
      const response = await api.get('/admin/companies', { params });
      return response;
    },
  });

  // Fetch system health
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const response = await api.get('/admin/health');
      return response;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch tickets
  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const response = await api.get('/admin/tickets');
      return response;
    },
  });

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (data: typeof createFormData) => {
      const response = await api.post('/admin/companies', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success('Şirket oluşturuldu');
      setIsCreateModalOpen(false);
      setCreateFormData({
        companyName: '',
        companyEmail: '',
        companyPhone: '',
        companyAddress: '',
        taxNumber: '',
        adminFirstName: '',
        adminLastName: '',
        adminEmail: '',
        adminPassword: '',
        adminPhone: '',
        autoApprove: false,
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Şirket oluşturulamadı');
    },
  });

  // Company actions
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/admin/companies/${id}/approve`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success('Şirket onaylandı');
      setActionModal(null);
      setSelectedCompany(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const response = await api.post(`/admin/companies/${id}/reject`, { reason });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success('Şirket reddedildi');
      setActionModal(null);
      setSelectedCompany(null);
      setActionReason('');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const response = await api.post(`/admin/companies/${id}/suspend`, { reason });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success('Şirket askıya alındı');
      setActionModal(null);
      setSelectedCompany(null);
      setActionReason('');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/admin/companies/${id}/reactivate`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      toast.success('Şirket yeniden aktifleştirildi');
      setActionModal(null);
      setSelectedCompany(null);
    },
  });

  // Delete company mutation
  const deleteCompanyMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-health'] });
      setActionModal(null);
      setSelectedCompany(null);
      toast.success('Şirket ve tüm verileri silindi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Şirket silinemedi');
    },
  });

  const companies: Company[] = companiesData?.data || [];
  const health: SystemHealth = healthData?.data;
  const tickets: Ticket[] = ticketsData?.data || [];

  // Fetch users for selected company
  const { data: companyUsersData, refetch: refetchCompanyUsers } = useQuery({
    queryKey: ['company-users', selectedCompanyForUsers?.id],
    queryFn: async () => {
      if (!selectedCompanyForUsers) return [];
      // SUPER_ADMIN can see all users, so we fetch all and filter by company
      const response = await api.getUsers();
      // Filter users by selected company
      const filteredUsers = (response.data || []).filter((u: any) => 
        u.companyId === selectedCompanyForUsers.id
      );
      return filteredUsers;
    },
    enabled: !!selectedCompanyForUsers && isUsersModalOpen,
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] }); // Refresh company stats
      refetchCompanyUsers();
      toast.success('Kullanıcı silindi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kullanıcı silinemedi');
    },
  });

  const companyUsers = companyUsersData || [];

  const handleAction = () => {
    if (!selectedCompany) return;

    switch (actionModal) {
      case 'approve':
        approveMutation.mutate(selectedCompany.id);
        break;
      case 'reject':
        rejectMutation.mutate({ id: selectedCompany.id, reason: actionReason });
        break;
      case 'suspend':
        suspendMutation.mutate({ id: selectedCompany.id, reason: actionReason });
        break;
      case 'reactivate':
        reactivateMutation.mutate(selectedCompany.id);
        break;
      case 'delete':
        deleteCompanyMutation.mutate(selectedCompany.id);
        break;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}g ${hours}s ${minutes}dk`;
  };

  const formatMemory = (bytes: number) => {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('tr-TR').format(num);
  };

  const isFormValid = () => {
    const { companyName, companyEmail, adminFirstName, adminLastName, adminEmail, adminPassword } = createFormData;
    
    return (
      companyName?.trim() &&
      companyEmail?.trim() &&
      companyEmail.includes('@') &&
      adminFirstName?.trim() &&
      adminLastName?.trim() &&
      adminEmail?.trim() &&
      adminEmail.includes('@') &&
      adminPassword?.trim() &&
      adminPassword.trim().length >= 8
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Süper Admin Paneli</h1>
          <p className="text-secondary-500">Şirket yönetimi, sistem sağlığı ve destek talepleri</p>
        </div>
        {activeTab === 'companies' && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Yeni Şirket
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value as TabType)}
        tabs={[
          { id: 'companies', label: 'Şirketler', icon: <Building2 className="w-4 h-4" /> },
          { id: 'health', label: 'Sistem Sağlığı', icon: <Activity className="w-4 h-4" /> },
          { id: 'tickets', label: 'Destek Talepleri', icon: <MessageSquare className="w-4 h-4" /> },
        ]}
      />

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card>
            <CardBody className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  placeholder="Şirket ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                  className="flex-1"
                />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'Tümü' },
                    { value: 'PENDING', label: 'Bekleyen' },
                    { value: 'APPROVED', label: 'Onaylanan' },
                    { value: 'REJECTED', label: 'Reddedilen' },
                    { value: 'SUSPENDED', label: 'Askıya Alınan' },
                  ]}
                  className="w-48"
                />
              </div>
            </CardBody>
          </Card>

          {/* Companies Table */}
          <Card>
            <CardBody className="p-0">
              {companiesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : companies.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Şirket</TableHeader>
                      <TableHeader>İletişim</TableHeader>
                      <TableHeader>Admin</TableHeader>
                      <TableHeader>İstatistikler</TableHeader>
                      <TableHeader>Durum</TableHeader>
                      <TableHeader>Tarih</TableHeader>
                      <TableHeader className="text-right">İşlemler</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-secondary-900">{company.name}</p>
                            {company.taxNumber && (
                              <p className="text-sm text-secondary-500">VKN: {company.taxNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm text-secondary-600">{company.email}</p>
                            {company.phone && (
                              <p className="text-sm text-secondary-500">{company.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {company.admin ? (
                            <div>
                              <p className="text-sm font-medium">
                                {company.admin.firstName} {company.admin.lastName}
                              </p>
                              <p className="text-xs text-secondary-500">{company.admin.email}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-secondary-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <span className="text-secondary-500">Kullanıcı:</span>{' '}
                              <span className="font-medium">{company.stats.users}</span>
                              {company.stats.users > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-primary-600 hover:text-primary-700"
                                  onClick={() => {
                                    setSelectedCompanyForUsers(company);
                                    setIsUsersModalOpen(true);
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                            <div>
                              <span className="text-secondary-500">Depo:</span>{' '}
                              <span className="font-medium">{company.stats.warehouses}</span>
                            </div>
                            <div>
                              <span className="text-secondary-500">Ürün:</span>{' '}
                              <span className="font-medium">{company.stats.products}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariants[company.status]}>
                            {statusLabels[company.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-secondary-500">
                          {formatDate(company.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {company.status === 'PENDING' && (
                              <>
                                <Button
                                  variant="success"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCompany(company);
                                    setActionModal('approve');
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCompany(company);
                                    setActionModal('reject');
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {company.status === 'APPROVED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-warning-300 text-warning-700 hover:bg-warning-50"
                                onClick={() => {
                                  setSelectedCompany(company);
                                  setActionModal('suspend');
                                }}
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                            )}
                            {company.status === 'SUSPENDED' && (
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => {
                                  setSelectedCompany(company);
                                  setActionModal('reactivate');
                                }}
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            {/* Delete button - always visible for Super Admin */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                              onClick={() => {
                                setSelectedCompany(company);
                                setActionModal('delete');
                              }}
                              title="Şirketi tamamen sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="empty-state py-12">
                  <Building2 className="w-12 h-12 text-secondary-300 mb-3" />
                  <p className="text-secondary-600">Şirket bulunamadı</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* System Health Tab */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {healthLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : health ? (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm text-secondary-500">Toplam Şirket</p>
                        <p className="text-xl font-bold">{health.companies.total}</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          {health.companies.approved} onaylı, {health.companies.pending} bekleyen
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                        <Users className="w-5 h-5 text-success-600" />
                      </div>
                      <div>
                        <p className="text-sm text-secondary-500">Toplam Kullanıcı</p>
                        <p className="text-xl font-bold">{health.users.total}</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          {health.users.active} aktif
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-accent-600" />
                      </div>
                      <div>
                        <p className="text-sm text-secondary-500">Toplam Sipariş</p>
                        <p className="text-xl font-bold">{health.orders.total}</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          Bugün: {health.orders.today}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-warning-600" />
                      </div>
                      <div>
                        <p className="text-sm text-secondary-500">Toplam Ürün</p>
                        <p className="text-xl font-bold">{health.inventory.totalProducts}</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          {health.inventory.lowStockProducts} düşük stok
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Detailed Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Companies Stats */}
                <Card>
                  <div className="card-header">
                    <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Şirket İstatistikleri
                    </h3>
                  </div>
                  <CardBody>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam</span>
                        <span className="font-bold">{health.companies.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-success-600">Onaylanan</span>
                        <span className="font-medium text-success-600">{health.companies.approved}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-warning-600">Bekleyen</span>
                        <span className="font-medium text-warning-600">{health.companies.pending}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-danger-600">Reddedilen</span>
                        <span className="font-medium text-danger-600">{health.companies.rejected}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Askıya Alınan</span>
                        <span className="font-medium text-secondary-600">{health.companies.suspended}</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Users Stats */}
                <Card>
                  <div className="card-header">
                    <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Kullanıcı İstatistikleri
                    </h3>
                  </div>
                  <CardBody>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam</span>
                        <span className="font-bold">{health.users.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-success-600">Aktif</span>
                        <span className="font-medium text-success-600">{health.users.active}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-500">Personel</span>
                        <span className="font-medium">{health.users.byRole.staff}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-primary-600">Admin</span>
                        <span className="font-medium text-primary-600">{health.users.byRole.admin}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-accent-600">Süper Admin</span>
                        <span className="font-medium text-accent-600">{health.users.byRole.superAdmin}</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Orders Stats */}
                <Card>
                  <div className="card-header">
                    <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      Sipariş İstatistikleri
                    </h3>
                  </div>
                  <CardBody>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam</span>
                        <span className="font-bold">{health.orders.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-primary-600">Bugün</span>
                        <span className="font-medium text-primary-600">{health.orders.today}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-500">Son 7 Gün</span>
                        <span className="font-medium">{health.orders.last7Days}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-warning-600">Bekleyen</span>
                        <span className="font-medium text-warning-600">{health.orders.byStatus.pending}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-primary-600">Paketlendi</span>
                        <span className="font-medium text-primary-600">{health.orders.byStatus.processing}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-success-600">Teslim Edildi</span>
                        <span className="font-medium text-success-600">{health.orders.byStatus.delivered}</span>
                      </div>
                      <div className="pt-2 border-t border-secondary-200">
                        <div className="flex items-center justify-between">
                          <span className="text-secondary-700 font-medium">Toplam Ciro</span>
                          <span className="font-bold text-lg text-success-600">
                            {formatCurrency(health.orders.totalRevenue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Inventory Stats */}
                <Card>
                  <div className="card-header">
                    <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      Stok İstatistikleri
                    </h3>
                  </div>
                  <CardBody>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam Ürün</span>
                        <span className="font-bold">{health.inventory.totalProducts}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam Depo</span>
                        <span className="font-medium">{health.inventory.totalWarehouses}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-secondary-600">Toplam Stok</span>
                        <span className="font-medium">{formatNumber(health.inventory.totalStock)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'font-medium',
                          health.inventory.lowStockProducts > 0 ? 'text-warning-600' : 'text-success-600'
                        )}>
                          Düşük Stoklu Ürün
                        </span>
                        <Badge variant={health.inventory.lowStockProducts > 0 ? 'warning' : 'success'}>
                          {health.inventory.lowStockProducts}
                        </Badge>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Server Info */}
              <Card>
                <div className="card-header">
                  <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                    <Server className="w-5 h-5" />
                    Sunucu Bilgileri
                  </h3>
                </div>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Veritabanı</p>
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {health.database.status}
                      </Badge>
                      <p className="text-xs text-secondary-400 mt-1">{health.database.provider}</p>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Çalışma Süresi</p>
                      <p className="font-medium">{formatUptime(health.server.uptime)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Node.js Versiyonu</p>
                      <p className="font-medium">{health.server.nodeVersion}</p>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Platform</p>
                      <p className="font-medium">{health.server.platform}</p>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Bellek Kullanımı</p>
                      <p className="font-medium">
                        {formatMemory(health.server.memory.heapUsed)} / {formatMemory(health.server.memory.heapTotal)}
                      </p>
                      <div className="mt-2 h-2 bg-secondary-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 transition-all"
                          style={{
                            width: `${(health.server.memory.heapUsed / health.server.memory.heapTotal) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500 mb-1">Aktif Entegrasyonlar</p>
                      <p className="font-medium">{health.integrations.active}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Support Stats */}
              <Card>
                <div className="card-header">
                  <h3 className="font-semibold text-secondary-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Destek İstatistikleri
                  </h3>
                </div>
                <CardBody>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-sm text-secondary-500">Açık Talepler</p>
                      <p className="text-2xl font-bold text-warning-600">{health.support.open}</p>
                    </div>
                    <div>
                      <p className="text-sm text-secondary-500">Çözülen Talepler</p>
                      <p className="text-2xl font-bold text-success-600">{health.support.resolved}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : (
            <div className="empty-state py-12">
              <AlertCircle className="w-12 h-12 text-secondary-300 mb-3" />
              <p className="text-secondary-600">Sistem sağlığı bilgisi alınamadı</p>
            </div>
          )}
        </div>
      )}

      {/* Tickets Tab */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <Card>
            <CardBody className="p-0">
              {ticketsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : tickets.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Tarih</TableHeader>
                      <TableHeader>Tip</TableHeader>
                      <TableHeader>Konu</TableHeader>
                      <TableHeader>E-posta</TableHeader>
                      <TableHeader>Durum</TableHeader>
                      <TableHeader className="text-right">İşlemler</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="text-sm text-secondary-500">
                          {formatDate(ticket.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ticket.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{ticket.subject}</p>
                          <p className="text-sm text-secondary-500 line-clamp-1">{ticket.message}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{ticket.email}</p>
                          {ticket.companyName && (
                            <p className="text-xs text-secondary-500">{ticket.companyName}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ticket.status === 'RESOLVED' ? 'success' : 'warning'}>
                            {ticket.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Görüntüle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="empty-state py-12">
                  <MessageSquare className="w-12 h-12 text-secondary-300 mb-3" />
                  <p className="text-secondary-600">Destek talebi bulunamadı</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Create Company Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateFormData({
            companyName: '',
            companyEmail: '',
            companyPhone: '',
            companyAddress: '',
            taxNumber: '',
            adminFirstName: '',
            adminLastName: '',
            adminEmail: '',
            adminPassword: '',
            adminPhone: '',
            autoApprove: false,
          });
        }}
        title="Yeni Şirket Oluştur"
        size="lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-secondary-700">
              Şirket Bilgileri
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Şirket Adı *
                </label>
                <Input
                  value={createFormData.companyName}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, companyName: e.target.value })
                  }
                  placeholder="Şirket adı"
                  leftIcon={<Building2 className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Şirket E-postası *
                </label>
                <Input
                  type="email"
                  value={createFormData.companyEmail}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, companyEmail: e.target.value })
                  }
                  placeholder="sirket@example.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Telefon
                </label>
                <Input
                  value={createFormData.companyPhone}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, companyPhone: e.target.value })
                  }
                  placeholder="+90 555 123 4567"
                  leftIcon={<Phone className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Vergi Numarası
                </label>
                <Input
                  value={createFormData.taxNumber}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, taxNumber: e.target.value })
                  }
                  placeholder="VKN"
                  leftIcon={<FileText className="w-4 h-4" />}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-secondary-500 mb-1">
                Adres
              </label>
              <Input
                value={createFormData.companyAddress}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, companyAddress: e.target.value })
                }
                placeholder="Şirket adresi"
                leftIcon={<MapPin className="w-4 h-4" />}
              />
            </div>
          </div>

          <div className="border-t border-secondary-200 pt-4">
            <label className="block text-sm font-medium text-secondary-700 mb-3">
              Admin Kullanıcı Bilgileri
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Ad *
                </label>
                <Input
                  value={createFormData.adminFirstName}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, adminFirstName: e.target.value })
                  }
                  placeholder="Ad"
                  leftIcon={<User className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Soyad *
                </label>
                <Input
                  value={createFormData.adminLastName}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, adminLastName: e.target.value })
                  }
                  placeholder="Soyad"
                  leftIcon={<User className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  E-posta *
                </label>
                <Input
                  type="email"
                  value={createFormData.adminEmail}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, adminEmail: e.target.value })
                  }
                  placeholder="admin@example.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Telefon
                </label>
                <Input
                  value={createFormData.adminPhone}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, adminPhone: e.target.value })
                  }
                  placeholder="+90 555 123 4567"
                  leftIcon={<Phone className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary-500 mb-1">
                  Şifre *
                </label>
                <Input
                  type="password"
                  value={createFormData.adminPassword}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, adminPassword: e.target.value })
                  }
                  placeholder="En az 8 karakter"
                  leftIcon={<Lock className="w-4 h-4" />}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="autoApprove"
              checked={createFormData.autoApprove}
              onChange={(e) =>
                setCreateFormData({ ...createFormData, autoApprove: e.target.checked })
              }
              className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="autoApprove" className="text-sm text-secondary-600">
              Otomatik onayla (şirket hemen aktif olsun)
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateFormData({
                  companyName: '',
                  companyEmail: '',
                  companyPhone: '',
                  companyAddress: '',
                  taxNumber: '',
                  adminFirstName: '',
                  adminLastName: '',
                  adminEmail: '',
                  adminPassword: '',
                  adminPhone: '',
                  autoApprove: false,
                });
              }}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => createCompanyMutation.mutate(createFormData)}
              isLoading={createCompanyMutation.isPending}
              disabled={!isFormValid()}
            >
              Oluştur
            </Button>
          </div>
        </div>
      </Modal>

      {/* Action Modals */}
      <Modal
        isOpen={actionModal !== null}
        onClose={() => {
          setActionModal(null);
          setSelectedCompany(null);
          setActionReason('');
        }}
        title={
          actionModal === 'approve'
            ? 'Şirketi Onayla'
            : actionModal === 'reject'
            ? 'Şirketi Reddet'
            : actionModal === 'suspend'
            ? 'Şirketi Askıya Al'
            : actionModal === 'delete'
            ? 'Şirketi Tamamen Sil'
            : 'Şirketi Yeniden Aktifleştir'
        }
      >
        <div className="space-y-4">
          {selectedCompany && (
            <div className="p-4 bg-secondary-50 rounded-xl">
              <p className="font-medium text-secondary-900">{selectedCompany.name}</p>
              <p className="text-sm text-secondary-500">{selectedCompany.email}</p>
            </div>
          )}

          {(actionModal === 'reject' || actionModal === 'suspend') && (
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Sebep (Opsiyonel)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={3}
                placeholder="İşlem sebebini belirtin..."
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setActionModal(null);
                setSelectedCompany(null);
                setActionReason('');
              }}
            >
              İptal
            </Button>
            <Button
              variant={
                actionModal === 'approve' || actionModal === 'reactivate'
                  ? 'success'
                  : 'danger'
              }
              className="flex-1"
              onClick={handleAction}
              isLoading={
                approveMutation.isPending ||
                rejectMutation.isPending ||
                suspendMutation.isPending ||
                reactivateMutation.isPending ||
                deleteCompanyMutation.isPending
              }
            >
              {actionModal === 'approve'
                ? 'Onayla'
                : actionModal === 'reject'
                ? 'Reddet'
                : actionModal === 'suspend'
                ? 'Askıya Al'
                : actionModal === 'delete'
                ? 'Evet, Tamamen Sil'
                : 'Aktifleştir'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Company Users Modal */}
      <Modal
        isOpen={isUsersModalOpen}
        onClose={() => {
          setIsUsersModalOpen(false);
          setSelectedCompanyForUsers(null);
        }}
        title={`${selectedCompanyForUsers?.name} - Kullanıcılar`}
        size="lg"
      >
        {companyUsers.length > 0 ? (
          <div className="space-y-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Kullanıcı</TableHeader>
                  <TableHeader>E-posta</TableHeader>
                  <TableHeader>Rol</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader className="text-right">İşlemler</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {companyUsers.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">
                        {user.firstName} {user.lastName}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-secondary-600">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        user.role === 'SUPER_ADMIN' ? 'primary' :
                        user.role === 'ADMIN' ? 'success' : 'secondary'
                      }>
                        {user.role === 'SUPER_ADMIN' ? 'Süper Admin' :
                         user.role === 'ADMIN' ? 'Admin' : 'Personel'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                          onClick={() => {
                            if (confirm(`${user.firstName} ${user.lastName} kullanıcısını silmek istediğinize emin misiniz?`)) {
                              deleteUserMutation.mutate(user.id);
                            }
                          }}
                          isLoading={deleteUserMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="empty-state py-12">
            <Users className="w-12 h-12 text-secondary-300 mb-3" />
            <p className="text-secondary-600">Bu şirkete ait kullanıcı bulunamadı</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

