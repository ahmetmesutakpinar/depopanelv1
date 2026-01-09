import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Phone, Save, Key } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Card, CardBody } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const profileSchema = z.object({
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifre gerekli'),
  newPassword: z.string().min(6, 'Yeni şifre en az 6 karakter olmalı'),
  confirmPassword: z.string().min(1, 'Şifre onayı gerekli'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function Profile() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileForm) => api.updateProfile(data),
    onSuccess: (response) => {
      if (response.success && response.data) {
        updateUser(response.data);
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        toast.success('Profil güncellendi');
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Profil güncellenemedi');
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => {
      resetPassword();
      toast.success('Şifre güncellendi');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Şifre güncellenemedi');
    },
  });

  const onProfileSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    updatePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Profilim</h1>
          <p className="text-secondary-500">Hesap bilgilerinizi yönetin</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Info Card */}
        <div className="lg:col-span-1">
          <Card>
            <CardBody className="text-center p-6">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-semibold text-2xl">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-secondary-900 mb-1">
                {user?.firstName} {user?.lastName}
              </h3>
              <p className="text-sm text-secondary-500 mb-2">{user?.email}</p>
              <div className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 rounded-full">
                <span className="text-xs font-medium text-primary-700">
                  {user?.role === 'SUPER_ADMIN' ? 'Süper Admin' : 
                   user?.role === 'ADMIN' ? 'Admin' : 'Personel'}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-secondary-200">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-secondary-500 hover:text-secondary-900'
              }`}
            >
              Profil Bilgileri
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'password'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-secondary-500 hover:text-secondary-900'
              }`}
            >
              Şifre Değiştir
            </button>
          </div>

          {/* Profile Form */}
          {activeTab === 'profile' && (
            <Card>
              <CardBody>
                <form onSubmit={handleSubmitProfile(onProfileSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input
                      label="Ad"
                      leftIcon={<User className="w-4 h-4" />}
                      error={profileErrors.firstName?.message}
                      {...registerProfile('firstName')}
                    />
                    <Input
                      label="Soyad"
                      leftIcon={<User className="w-4 h-4" />}
                      error={profileErrors.lastName?.message}
                      {...registerProfile('lastName')}
                    />
                  </div>

                  <Input
                    label="E-posta"
                    type="email"
                    leftIcon={<Mail className="w-4 h-4" />}
                    error={profileErrors.email?.message}
                    {...registerProfile('email')}
                  />

                  <Input
                    label="Telefon"
                    leftIcon={<Phone className="w-4 h-4" />}
                    error={profileErrors.phone?.message}
                    {...registerProfile('phone')}
                  />

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      isLoading={updateProfileMutation.isPending}
                      leftIcon={<Save className="w-4 h-4" />}
                    >
                      Değişiklikleri Kaydet
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}

          {/* Password Form */}
          {activeTab === 'password' && (
            <Card>
              <CardBody>
                <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="space-y-5">
                  <Input
                    label="Mevcut Şifre"
                    type="password"
                    leftIcon={<Key className="w-4 h-4" />}
                    error={passwordErrors.currentPassword?.message}
                    {...registerPassword('currentPassword')}
                  />

                  <Input
                    label="Yeni Şifre"
                    type="password"
                    leftIcon={<Key className="w-4 h-4" />}
                    error={passwordErrors.newPassword?.message}
                    {...registerPassword('newPassword')}
                  />

                  <Input
                    label="Yeni Şifre (Tekrar)"
                    type="password"
                    leftIcon={<Key className="w-4 h-4" />}
                    error={passwordErrors.confirmPassword?.message}
                    {...registerPassword('confirmPassword')}
                  />

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      isLoading={updatePasswordMutation.isPending}
                      leftIcon={<Key className="w-4 h-4" />}
                    >
                      Şifreyi Güncelle
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

