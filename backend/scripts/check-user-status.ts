import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkUserStatus() {
  const email = 'demo@example.com';

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      console.log(`❌ Kullanıcı bulunamadı: ${email}`);
      return;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 KULLANICI DURUMU');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📧 E-posta: ${user.email}`);
    console.log(`👤 Ad Soyad: ${user.firstName} ${user.lastName}`);
    console.log(`🏢 Şirket: ${user.company.name}`);
    console.log(`👑 Rol: ${user.role}`);
    console.log(`📊 Aktif Durum: ${user.isActive ? '✅ Aktif' : '❌ Pasif'}`);
    console.log(`✉️  E-posta Doğrulama: ${user.emailVerified ? '✅ Doğrulanmış' : '❌ Doğrulanmamış'}`);
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserStatus();

