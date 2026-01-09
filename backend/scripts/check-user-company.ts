import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Kullanıcının company bilgisini kontrol et
 */
async function checkUserCompany() {
  const email = 'admin@deneme.com';

  try {
    console.log(`🔍 ${email} kullanıcısı kontrol ediliyor...\n`);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      console.error(`❌ Kullanıcı bulunamadı: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Kullanıcı bulundu:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Ad: ${user.firstName} ${user.lastName}`);
    console.log(`   - E-posta: ${user.email}`);
    console.log(`   - Rol: ${user.role}`);
    console.log(`   - Aktif: ${user.isActive}`);
    console.log(`   - Company ID: ${user.companyId || 'YOK'}`);

    if (user.company) {
      console.log(`\n✅ Şirket bilgisi:`);
      console.log(`   - Şirket ID: ${user.company.id}`);
      console.log(`   - Şirket Adı: ${user.company.name}`);
      console.log(`   - Durum: ${user.company.status}`);
    } else {
      console.log(`\n⚠️  Şirket bilgisi bulunamadı!`);
      console.log(`   Kullanıcının companyId'si: ${user.companyId}`);
      
      if (user.companyId) {
        const company = await prisma.company.findUnique({
          where: { id: user.companyId },
        });
        
        if (company) {
          console.log(`   ⚠️  Company kaydı var ama relation çalışmıyor!`);
        } else {
          console.log(`   ❌ Company kaydı bulunamadı! Kullanıcının companyId'si geçersiz.`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkUserCompany()
  .then(() => {
    console.log('\n✅ Kontrol tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error);
    process.exit(1);
  });

