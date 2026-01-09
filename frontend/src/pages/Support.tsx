import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HelpCircle, Mail, MessageSquare, Send, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Card, CardBody } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const ticketSchema = z.object({
  type: z.enum(['SUPPORT', 'COMPLAINT', 'SUGGESTION'], {
    required_error: 'Talep tipi seçin',
  }),
  subject: z.string().min(5, 'Konu en az 5 karakter olmalı'),
  message: z.string().min(20, 'Mesaj en az 20 karakter olmalı'),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  companyName: z.string().optional(),
});

type TicketForm = z.infer<typeof ticketSchema>;

export default function Support() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      email: user?.email || '',
      companyName: user?.companyName || '',
      type: 'SUPPORT',
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (data: TicketForm) => api.createSupportTicket(data),
    onSuccess: () => {
      toast.success('Destek talebiniz alındı. En kısa sürede yanıtlanacaktır.');
      setSubmitted(true);
      reset();
      setTimeout(() => setSubmitted(false), 5000);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Talep gönderilemedi');
    },
  });

  const onSubmit = (data: TicketForm) => {
    createTicketMutation.mutate(data);
  };


  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Teknik Destek</h1>
          <p className="text-secondary-500">
            Sorularınız, şikayetleriniz veya önerileriniz için bizimle iletişime geçin
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="text-center p-4">
            <HelpCircle className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-secondary-900 mb-1">Teknik Destek</h3>
            <p className="text-xs text-secondary-500">Sistem hataları ve teknik sorunlar</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center p-4">
            <MessageSquare className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-secondary-900 mb-1">Hızlı Yanıt</h3>
            <p className="text-xs text-secondary-500">24 saat içinde yanıt garantisi</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center p-4">
            <CheckCircle className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm text-secondary-900 mb-1">Profesyonel Çözüm</h3>
            <p className="text-xs text-secondary-500">Uzman ekibimiz yanınızda</p>
          </CardBody>
        </Card>
      </div>

      {/* Success Message */}
      {submitted && (
        <Card className="bg-success-50 border-success-200">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-success-900">Talebiniz alındı!</p>
                <p className="text-sm text-success-700">
                  Destek ekibimiz en kısa sürede size dönüş yapacaktır.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Ticket Form */}
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Talep Tipi *
                </label>
                <select
                  {...register('type')}
                  className="w-full px-4 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                >
                  <option value="SUPPORT">Teknik Destek</option>
                  <option value="COMPLAINT">Şikayet</option>
                  <option value="SUGGESTION">Öneri</option>
                </select>
                {errors.type && (
                  <p className="text-xs text-danger-600 mt-1">{errors.type.message}</p>
                )}
              </div>

              <Input
                label="E-posta *"
                type="email"
                leftIcon={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <Input
              label="Şirket Adı (Opsiyonel)"
              placeholder="Şirket adınız"
              {...register('companyName')}
            />

            <Input
              label="Konu *"
              placeholder="Örn: Stok güncelleme hatası"
              error={errors.subject?.message}
              {...register('subject')}
            />

            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Mesajınız *
              </label>
              <textarea
                {...register('message')}
                rows={6}
                className="w-full px-4 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
                placeholder="Sorununuzu, şikayetinizi veya önerinizi detaylı bir şekilde açıklayın..."
              />
              {errors.message && (
                <p className="text-xs text-danger-600 mt-1">{errors.message.message}</p>
              )}
            </div>

            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-primary-900">
                  <p className="font-medium mb-1">Bilgilendirme</p>
                  <p className="text-primary-700">
                    Destek talebiniz sistem yöneticilerine iletilecektir. Mümkün olduğunca detaylı
                    bilgi vermeniz sorunun hızlı çözülmesine yardımcı olacaktır.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                isLoading={createTicketMutation.isPending}
                leftIcon={<Send className="w-4 h-4" />}
              >
                Talebi Gönder
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

