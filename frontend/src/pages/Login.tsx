import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Package, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input } from '@/components/ui';

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  if (isAuthenticated) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    await login(data);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
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
              Hoş Geldiniz 👋
            </h1>
            <p className="text-secondary-500">
              Hesabınıza giriş yaparak devam edin
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="E-posta"
              type="email"
              placeholder="ornek@sirket.com"
              leftIcon={<Mail className="w-5 h-5" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Şifre"
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-secondary-600">Beni hatırla</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement forgot password functionality
                  alert('Şifre sıfırlama özelliği yakında eklenecek');
                }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Şifremi unuttum
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isSubmitting || isLoading}
            >
              Giriş Yap
            </Button>
          </form>

          {/* Register link */}
          <p className="mt-8 text-center text-secondary-500">
            Hesabınız yok mu?{' '}
            <Link
              to={ROUTES.REGISTER}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Şirket kaydı oluşturun
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Branding */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary-600 via-primary-700 to-accent-700 p-12 items-center justify-center">
        <div className="max-w-lg text-center text-white">
          <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 backdrop-blur-sm">
            <Package className="w-14 h-14 text-white" />
          </div>
          <h2 className="text-4xl font-bold mb-4 font-display">
            Stok Yönetiminde Devrim
          </h2>
          <p className="text-lg text-white/80 leading-relaxed">
            DepoPanel ile çoklu depo ve pazaryeri entegrasyonlarınızı tek platformdan yönetin.
            Siparişlerinizi otomatik senkronize edin, stoklarınızı gerçek zamanlı takip edin.
          </p>
          <div className="mt-8 flex items-center justify-center gap-8">
            <div>
              <p className="text-3xl font-bold">15+</p>
              <p className="text-sm text-white/60">Pazaryeri Entegrasyonu</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className="text-3xl font-bold">∞</p>
              <p className="text-sm text-white/60">Depo Kapasitesi</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div>
              <p className="text-3xl font-bold">7/24</p>
              <p className="text-sm text-white/60">Otomatik Sync</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

