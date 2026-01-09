import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Mail, Lock, User, Phone, Package, Eye, EyeOff, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input } from '@/components/ui';

const registerSchema = z.object({
  // Company
  companyName: z.string().min(2, 'Şirket adı en az 2 karakter olmalı'),
  companyEmail: z.string().email('Geçerli bir şirket e-postası girin'),
  companyPhone: z.string().optional(),
  companyAddress: z.string().optional(),
  taxNumber: z.string().optional(),
  // User
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  confirmPassword: z.string(),
  phone: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerUser, isAuthenticated, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    trigger,
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  if (isAuthenticated) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  const handleNextStep = async () => {
    const isValid = await trigger(['companyName', 'companyEmail']);
    if (isValid) setStep(2);
  };

  const onSubmit = async (data: RegisterForm) => {
    const { confirmPassword, ...registerData } = data;
    await registerUser(registerData);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image/Branding */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-accent-600 via-primary-700 to-primary-800 p-12 items-center justify-center">
        <div className="max-w-lg text-center text-white">
          <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 backdrop-blur-sm">
            <Package className="w-14 h-14 text-white" />
          </div>
          <h2 className="text-4xl font-bold mb-4 font-display">
            İşletmenizi Büyütün
          </h2>
          <p className="text-lg text-white/80 leading-relaxed">
            DepoPanel ile e-ticaret operasyonlarınızı kolaylaştırın.
            Hemen ücretsiz başvurun, onay sonrası tüm özelliklere erişin.
          </p>
          <div className="mt-8 space-y-4 text-left bg-white/10 backdrop-blur-sm rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                ✓
              </div>
              <span>Çoklu depo yönetimi</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                ✓
              </div>
              <span>Pazaryeri entegrasyonları</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                ✓
              </div>
              <span>Otomatik sipariş senkronizasyonu</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                ✓
              </div>
              <span>Gerçek zamanlı stok takibi</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center">
              <Package className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-secondary-900 font-display">
              DepoPanel
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-secondary-900 mb-2">
              Şirket Kaydı 🚀
            </h1>
            <p className="text-secondary-500">
              {step === 1 ? 'Şirket bilgilerini girin' : 'Admin hesabı oluşturun'}
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-primary-500' : 'bg-secondary-200'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-primary-500' : 'bg-secondary-200'}`} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {step === 1 ? (
              <>
                <Input
                  label="Şirket Adı *"
                  placeholder="Şirket adınız"
                  leftIcon={<Building2 className="w-5 h-5" />}
                  error={errors.companyName?.message}
                  {...register('companyName')}
                />

                <Input
                  label="Şirket E-posta *"
                  type="email"
                  placeholder="info@sirket.com"
                  leftIcon={<Mail className="w-5 h-5" />}
                  error={errors.companyEmail?.message}
                  {...register('companyEmail')}
                />

                <Input
                  label="Şirket Telefon"
                  placeholder="+90 555 123 4567"
                  leftIcon={<Phone className="w-5 h-5" />}
                  {...register('companyPhone')}
                />

                <Input
                  label="Şirket Adresi"
                  placeholder="İstanbul, Türkiye"
                  leftIcon={<MapPin className="w-5 h-5" />}
                  {...register('companyAddress')}
                />

                <Input
                  label="Vergi Numarası"
                  placeholder="1234567890"
                  {...register('taxNumber')}
                />

                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  onClick={handleNextStep}
                >
                  Devam Et
                </Button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Ad *"
                    placeholder="Adınız"
                    leftIcon={<User className="w-5 h-5" />}
                    error={errors.firstName?.message}
                    {...register('firstName')}
                  />

                  <Input
                    label="Soyad *"
                    placeholder="Soyadınız"
                    error={errors.lastName?.message}
                    {...register('lastName')}
                  />
                </div>

                <Input
                  label="E-posta *"
                  type="email"
                  placeholder="ornek@sirket.com"
                  leftIcon={<Mail className="w-5 h-5" />}
                  error={errors.email?.message}
                  {...register('email')}
                />

                <Input
                  label="Telefon"
                  placeholder="+90 555 123 4567"
                  leftIcon={<Phone className="w-5 h-5" />}
                  {...register('phone')}
                />

                <Input
                  label="Şifre *"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-5 h-5" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="hover:text-secondary-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  }
                  error={errors.password?.message}
                  {...register('password')}
                />

                <Input
                  label="Şifre Tekrar *"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-5 h-5" />}
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    size="lg"
                    onClick={() => setStep(1)}
                  >
                    Geri
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    size="lg"
                    isLoading={isSubmitting || isLoading}
                  >
                    Kayıt Ol
                  </Button>
                </div>
              </>
            )}
          </form>

          {/* Login link */}
          <p className="mt-8 text-center text-secondary-500">
            Zaten hesabınız var mı?{' '}
            <Link
              to={ROUTES.LOGIN}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Giriş yapın
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

