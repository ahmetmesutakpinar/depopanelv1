import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  Plus,
  Edit,
  Trash2,
  Search,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Phone,
  CheckCircle,
  XCircle,
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
import { formatDate, cn } from '@/utils';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
  permissions?: Record<string, boolean>;
  isActive: boolean;
  createdAt: string;
}

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  permissions?: Record<string, boolean>;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Süper Admin',
  ADMIN: 'Admin',
  STAFF: 'Personel',
};

const roleBadgeVariants: Record<string, 'primary' | 'success' | 'secondary'> = {
  SUPER_ADMIN: 'primary',
  ADMIN: 'success',
  STAFF: 'secondary',
};

export default function Users() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'STAFF',
    permissions: {
      dashboard: true,
      products: true,
      orders: true,
      orderPicking: true,
      pickingWaves: true,
      warehouses: true,
      locations: true,
      inventoryCounts: true,
      transfers: true,
      stockLogs: true,
      reports: true,
    },
  });

  // Available permissions
  const availablePermissions = [
    { key: 'dashboard', label: 'Dashboard', description: 'Ana sayfa ve istatistikleri görüntüleme' },
    { key: 'products', label: 'Ürünler', description: 'Ürün yönetimi (listeleme, ekleme, düzenleme)' },
    { key: 'orders', label: 'Siparişler', description: 'Sipariş görüntüleme ve yönetimi' },
    { key: 'orderPicking', label: 'Sipariş Hazırlama', description: 'Barkod okutarak sipariş hazırlama' },
    { key: 'pickingWaves', label: 'Toplama Dalgaları', description: 'Sipariş toplama dalgalarını yönetme' },
    { key: 'warehouses', label: 'Depolar', description: 'Depo yönetimi' },
    { key: 'locations', label: 'Lokasyonlar', description: 'Depo lokasyon yönetimi' },
    { key: 'inventoryCounts', label: 'Stok Sayım', description: 'Stok sayım görevlerini yönetme' },
    { key: 'transfers', label: 'Sevkiyat', description: 'Depolar arası transfer işlemleri' },
    { key: 'stockLogs', label: 'Stok Hareketleri', description: 'Stok hareket geçmişi' },
    { key: 'reports', label: 'Raporlar', description: 'Rapor görüntüleme' },
  ];

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: (data: UserFormData) => api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Kullanıcı oluşturuldu');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kullanıcı oluşturulamadı');
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserFormData> }) => 
      api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Kullanıcı güncellendi');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kullanıcı güncellenemedi');
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Kullanıcı silindi');
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Kullanıcı silinemedi');
    },
  });

  // Toggle user status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => 
      api.updateUser(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Kullanıcı durumu güncellendi');
    },
  });

  const users: UserData[] = usersData?.data || [];

  const filteredUsers = users.filter(
    (user) =>
      user.firstName.toLowerCase().includes(search.toLowerCase()) ||
      user.lastName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setSelectedUser(null);
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      role: 'STAFF',
      permissions: {
        dashboard: true,
        products: true,
        orders: true,
        orderPicking: true,
        warehouses: true,
        transfers: true,
        stockLogs: true,
        reports: true,
      },
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || '',
      role: user.role,
      permissions: (user as any).permissions || {
        dashboard: true,
        products: true,
        orders: true,
        orderPicking: true,
        pickingWaves: true,
        warehouses: true,
        locations: true,
        inventoryCounts: true,
        transfers: true,
        stockLogs: true,
        reports: true,
      },
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      role: 'STAFF',
      permissions: {
        dashboard: true,
        products: true,
        orders: true,
        orderPicking: true,
        pickingWaves: true,
        warehouses: true,
        locations: true,
        inventoryCounts: true,
        transfers: true,
        stockLogs: true,
        reports: true,
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedUser) {
      // Update - don't send password if empty
      const updateData: Partial<UserFormData> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        role: formData.role,
      };
      
      // Only send permissions if role is STAFF
      if (formData.role === 'STAFF' && formData.permissions) {
        updateData.permissions = formData.permissions;
      }
      
      if (formData.password) {
        updateData.password = formData.password;
      }
      updateMutation.mutate({ id: selectedUser.id, data: updateData });
    } else {
      // Create
      createMutation.mutate(formData);
    }
  };

  const handleDelete = () => {
    if (selectedUser) {
      deleteMutation.mutate(selectedUser.id);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <ShieldCheck className="w-4 h-4" />;
      case 'ADMIN':
        return <Shield className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Kullanıcılar</h1>
          <p className="text-secondary-500">Sistem kullanıcılarını yönetin</p>
        </div>
        <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
          Yeni Kullanıcı
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <UsersIcon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-secondary-500">Toplam</p>
                <p className="text-xl font-bold">{users.length}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <p className="text-sm text-secondary-500">Aktif</p>
                <p className="text-xl font-bold">{users.filter(u => u.isActive).length}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-warning-600" />
              </div>
              <div>
                <p className="text-sm text-secondary-500">Admin</p>
                <p className="text-xl font-bold">
                  {users.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-secondary-600" />
              </div>
              <div>
                <p className="text-sm text-secondary-500">Personel</p>
                <p className="text-xl font-bold">{users.filter(u => u.role === 'STAFF').length}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardBody className="p-4">
          <Input
            placeholder="Kullanıcı ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-md"
          />
        </CardBody>
      </Card>

      {/* Users Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Kullanıcı</TableHeader>
                  <TableHeader>İletişim</TableHeader>
                  <TableHeader>Rol</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Kayıt Tarihi</TableHeader>
                  <TableHeader className="text-right">İşlemler</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium text-sm">
                            {user.firstName[0]}{user.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-secondary-900">
                            {user.firstName} {user.lastName}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Mail className="w-3.5 h-3.5" />
                          {user.email}
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2 text-sm text-secondary-500">
                            <Phone className="w-3.5 h-3.5" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariants[user.role]} className="gap-1">
                        {getRoleIcon(user.role)}
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleStatusMutation.mutate({ 
                          id: user.id, 
                          isActive: !user.isActive 
                        })}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium transition-colors',
                          user.isActive
                            ? 'bg-success-100 text-success-700 hover:bg-success-200'
                            : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                        )}
                      >
                        {user.isActive ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Aktif
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            Pasif
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-secondary-500">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {/* Show delete button if:
                            - Current user is SUPER_ADMIN (can delete anyone except themselves)
                            - OR current user is ADMIN and target user is not ADMIN/SUPER_ADMIN
                        */}
                        {((currentUser?.role === 'SUPER_ADMIN' && user.id !== currentUser?.id) ||
                          (currentUser?.role === 'ADMIN' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                            onClick={() => {
                              setSelectedUser(user);
                              setIsDeleteModalOpen(true);
                            }}
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
              <UsersIcon className="w-12 h-12 text-secondary-300 mb-3" />
              <p className="text-secondary-600">
                {search ? 'Kullanıcı bulunamadı' : 'Henüz kullanıcı yok'}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={selectedUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ad"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
            <Input
              label="Soyad"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>

          <Input
            label="E-posta"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={!!selectedUser}
          />

          <Input
            label={selectedUser ? 'Yeni Şifre (boş bırakılabilir)' : 'Şifre'}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!selectedUser}
            placeholder={selectedUser ? 'Değiştirmek için yeni şifre girin' : ''}
          />

          <Input
            label="Telefon"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+90 5XX XXX XXXX"
          />

          <Select
            label="Rol"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            options={[
              { value: 'STAFF', label: 'Personel' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
          />

          {/* Permissions - Only show for STAFF role */}
          {formData.role === 'STAFF' && (
            <div className="space-y-3 pt-2">
              <label className="block text-sm font-medium text-secondary-700">
                İzinler
              </label>
              <p className="text-xs text-secondary-500 mb-3">
                Bu personelin hangi bölümlere erişebileceğini seçin
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-3 bg-secondary-50 rounded-lg border border-secondary-200">
                {availablePermissions.map((permission) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-3 p-3 bg-white rounded-lg border border-secondary-200 hover:border-primary-300 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions?.[permission.key] || false}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          permissions: {
                            ...formData.permissions,
                            [permission.key]: e.target.checked,
                          },
                        });
                      }}
                      className="mt-1 w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-secondary-900 text-sm">
                        {permission.label}
                      </div>
                      <div className="text-xs text-secondary-500 mt-0.5">
                        {permission.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={closeModal}
            >
              İptal
            </Button>
            <Button
              type="submit"
              className="flex-1"
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {selectedUser ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Kullanıcı Sil"
      >
        <div className="space-y-4">
          <p className="text-secondary-600">
            <span className="font-medium text-secondary-900">
              {selectedUser?.firstName} {selectedUser?.lastName}
            </span>{' '}
            kullanıcısını silmek istediğinize emin misiniz?
          </p>
          <p className="text-sm text-danger-600">
            Bu işlem geri alınamaz.
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              Sil
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

