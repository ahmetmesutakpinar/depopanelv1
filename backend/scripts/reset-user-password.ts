import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Kullanıcı şifresini sıfırla
 */
async function resetUserPassword() {
  const email = 'admin@deneme.com';
  const newPassword = 'admin123'; // Varsayılan şifre

  try {
    console.log(`🔄 ${email} kullanıcısının şifresi sıfırlanıyor...`);

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ Kullanıcı bulunamadı: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Kullanıcı bulundu: ${user.firstName} ${user.lastName} (${user.role})`);

    // Şifreyi hashle
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Şifreyi güncelle
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    console.log(`✅ Şifre başarıyla sıfırlandı!`);
    console.log(`📧 E-posta: ${email}`);
    console.log(`🔑 Yeni şifre: ${newPassword}`);
    console.log(`\n⚠️  Güvenlik için şifreyi ilk girişte değiştirmeyi unutmayın!`);
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Script çalıştır
resetUserPassword()
  .then(() => {
    console.log('\n✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

