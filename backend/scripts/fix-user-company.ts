import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Kullanıcının company'sini kontrol et ve düzelt
 */
async function fixUserCompany() {
  const email = 'admin@deneme.com';

  try {
    console.log(`🔍 ${email} kullanıcısı kontrol ediliyor...\n`);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company: true,
      },
    });

    if (!user) {
      console.error(`❌ Kullanıcı bulunamadı: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Kullanıcı bulundu:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Ad: ${user.firstName} ${user.lastName}`);
    console.log(`   - Rol: ${user.role}`);
    console.log(`   - Company ID: ${user.companyId || 'YOK'}`);

    if (!user.company && user.companyId) {
      console.log(`\n⚠️  Company kaydı bulunamadı ama companyId var: ${user.companyId}`);
      
      // Company kaydını kontrol et
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
      });

      if (!company) {
        console.log(`❌ Company kaydı gerçekten yok! Yeni company oluşturuluyor...`);
        
        // Yeni company oluştur
        const newCompany = await prisma.company.create({
          data: {
            name: 'Deneme Şirketi',
            email: 'admin@deneme.com',
            status: 'APPROVED',
          },
        });

        // Kullanıcının companyId'sini güncelle
        await prisma.user.update({
          where: { id: user.id },
          data: { companyId: newCompany.id },
        });

        console.log(`✅ Yeni company oluşturuldu: ${newCompany.name} (ID: ${newCompany.id})`);
      }
    } else if (!user.company && !user.companyId) {
      console.log(`\n⚠️  Kullanıcının company'si yok! Yeni company oluşturuluyor...`);
      
      // Yeni company oluştur
      const newCompany = await prisma.company.create({
        data: {
          name: 'Deneme Şirketi',
          email: 'admin@deneme.com',
          status: 'APPROVED',
        },
      });

      // Kullanıcının companyId'sini güncelle
      await prisma.user.update({
        where: { id: user.id },
        data: { companyId: newCompany.id },
      });

      console.log(`✅ Yeni company oluşturuldu: ${newCompany.name} (ID: ${newCompany.id})`);
    } else if (user.company) {
      console.log(`\n✅ Company bilgisi mevcut:`);
      console.log(`   - Şirket Adı: ${user.company.name}`);
      console.log(`   - Durum: ${user.company.status}`);
      
      // Eğer status APPROVED değilse, onayla
      if (user.company.status !== 'APPROVED') {
        console.log(`\n⚠️  Company durumu ${user.company.status}, APPROVED yapılıyor...`);
        await prisma.company.update({
          where: { id: user.company.id },
          data: { status: 'APPROVED' },
        });
        console.log(`✅ Company durumu APPROVED olarak güncellendi`);
      }
    }

    console.log(`\n✅ Kullanıcı ve company kontrolü tamamlandı!`);
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixUserCompany()
  .then(() => {
    console.log('\n✅ Script başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

