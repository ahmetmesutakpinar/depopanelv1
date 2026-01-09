import { prisma, connectDatabase, disconnectDatabase } from '../src/config/index.js';
import bcrypt from 'bcrypt';

/**
 * Production database'e süper admin hesabı ekler
 * 
 * Kullanım:
 * npm run script:create-super-admin
 * 
 * Veya şifre belirtmek için:
 * npm run script:create-super-admin -- --password "YeniSifre123!"
 * 
 * Veya environment variable ile:
 * SUPER_ADMIN_PASSWORD="GüvenliSifre123!" npm run script:create-super-admin
 */
async function createSuperAdmin() {
  try {
    console.log('🔄 Database bağlantısı kuruluyor...');
    await connectDatabase();
    
    const email = 'admin@depopanel.com';
    const defaultPassword = 'Admin123!';
    
    // Şifre argümanından al (opsiyonel)
    let password = defaultPassword;
    
    // Environment variable'dan kontrol et
    if (process.env.SUPER_ADMIN_PASSWORD) {
      password = process.env.SUPER_ADMIN_PASSWORD;
      console.log('📝 Şifre environment variable\'dan alındı');
    }
    
    // Command line argümanından kontrol et
    const passwordArgIndex = process.argv.findIndex(arg => arg === '--password' || arg.startsWith('--password='));
    if (passwordArgIndex !== -1) {
      const passwordArg = process.argv[passwordArgIndex];
      if (passwordArg.includes('=')) {
        password = passwordArg.split('=')[1];
      } else if (process.argv[passwordArgIndex + 1]) {
        password = process.argv[passwordArgIndex + 1];
      }
      console.log('📝 Şifre command line argümanından alındı');
    }
    
    console.log('📋 Süper Admin oluşturuluyor...');
    console.log(`   📧 E-posta: ${email}`);
    
    // 1. Sistem şirketini oluştur/güncelle
    const adminCompany = await prisma.company.upsert({
      where: { email: 'system@depopanel.com' },
      update: {
        name: 'DepoPanel Sistem Yönetimi',
        status: 'APPROVED',
      },
      create: {
        name: 'DepoPanel Sistem Yönetimi',
        email: 'system@depopanel.com',
        phone: '+90 555 000 0000',
        status: 'APPROVED',
      },
    });
    
    console.log('✅ Sistem şirketi hazır:', adminCompany.name);
    
    // 2. Süper admin kullanıcısını oluştur/güncelle
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const superAdmin = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword, // Şifreyi güncelle
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        companyId: adminCompany.id,
        isActive: true,
        emailVerified: true,
      },
      create: {
        email,
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        companyId: adminCompany.id,
        isActive: true,
        emailVerified: true,
      },
    });
    
    console.log('✅ Süper Admin hesabı oluşturuldu/güncellendi!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SÜPER ADMİN BİLGİLERİ:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📧 E-posta: ${email}`);
    console.log(`🔑 Şifre: ${password}`);
    console.log(`👤 Rol: Süper Admin`);
    console.log(`🏢 Şirket: ${adminCompany.name}`);
    console.log(`🆔 Kullanıcı ID: ${superAdmin.id}`);
    console.log(`🆔 Şirket ID: ${adminCompany.id}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  Güvenlik için şifreyi ilk girişte değiştirmeyi unutmayın!');
    
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await disconnectDatabase();
    console.log('✅ Database bağlantısı kapatıldı');
  }
}

// Script çalıştır
createSuperAdmin()
  .then(() => {
    console.log('🎉 Süper Admin oluşturma işlemi tamamlandı!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Süper Admin oluşturma hatası:', error);
    process.exit(1);
  });

