import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

/**
 * Kullanıcı hesabını aktif et
 */
async function activateUser() {
  const email = 'demo@example.com';

  try {
    console.log(`🔄 ${email} kullanıcısı aktif ediliyor...`);

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      console.error(`❌ Kullanıcı bulunamadı: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Kullanıcı bulundu: ${user.firstName} ${user.lastName} (${user.role})`);
    console.log(`   Şirket: ${user.company.name}`);
    console.log(`   Mevcut durum: ${user.isActive ? 'Aktif' : 'Pasif'}`);
    console.log(`   E-posta doğrulama: ${user.emailVerified ? 'Doğrulanmış' : 'Doğrulanmamış'}`);

    // Hesabı aktif et ve e-posta doğrulamasını yap
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isActive: true,
        emailVerified: true,
      },
    });

    console.log(`\n✅ Hesap başarıyla aktif edildi!`);
    console.log(`📧 E-posta: ${updatedUser.email}`);
    console.log(`🔑 Şifre: Admin123!`);
    console.log(`👤 Rol: ${updatedUser.role}`);
    console.log(`📊 Durum: ${updatedUser.isActive ? 'Aktif' : 'Pasif'}`);
    console.log(`\n✅ Kullanıcı artık sisteme giriş yapabilir!`);
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
activateUser()
  .then(() => {
    console.log('\n✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

