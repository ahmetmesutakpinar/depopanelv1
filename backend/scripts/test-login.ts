import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Login işlemini test et
 */
async function testLogin() {
  const email = 'admin@deneme.com';
  const password = 'admin123';

  try {
    console.log('🧪 Login testi başlıyor...\n');

    // 1. Environment variables kontrolü
    console.log('1️⃣ Environment variables kontrol ediliyor...');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('❌ JWT_SECRET eksik veya çok kısa! (en az 32 karakter olmalı)');
      process.exit(1);
    }
    console.log('✅ JWT_SECRET mevcut');

    // 2. Database bağlantısı testi
    console.log('\n2️⃣ Database bağlantısı test ediliyor...');
    await prisma.$connect();
    console.log('✅ Database bağlantısı başarılı');

    // 3. Kullanıcıyı bul
    console.log('\n3️⃣ Kullanıcı aranıyor...');
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
    console.log(`✅ Kullanıcı bulundu: ${user.firstName} ${user.lastName}`);

    // 4. Şifre kontrolü
    console.log('\n4️⃣ Şifre kontrol ediliyor...');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.error('❌ Şifre hatalı!');
      process.exit(1);
    }
    console.log('✅ Şifre doğru');

    // 5. Kullanıcı durumu kontrolü
    console.log('\n5️⃣ Kullanıcı durumu kontrol ediliyor...');
    if (!user.isActive) {
      console.error('❌ Kullanıcı aktif değil!');
      process.exit(1);
    }
    console.log('✅ Kullanıcı aktif');

    // 6. Company kontrolü
    console.log('\n6️⃣ Company kontrol ediliyor...');
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.company) {
        console.error('❌ Company bilgisi bulunamadı!');
        process.exit(1);
      }
      console.log(`✅ Company: ${user.company.name} (${user.company.status})`);
      
      if (user.company.status !== 'APPROVED') {
        console.error(`❌ Company durumu: ${user.company.status} (APPROVED olmalı)`);
        process.exit(1);
      }
    } else {
      console.log('✅ SUPER_ADMIN - company kontrolü atlandı');
    }

    // 7. Token oluşturma testi
    console.log('\n7️⃣ JWT token oluşturuluyor...');
    const companyId = user.companyId || (user.company?.id || '');
    
    if (!companyId && user.role !== 'SUPER_ADMIN') {
      console.error('❌ CompanyId bulunamadı!');
      process.exit(1);
    }

    const token = jwt.sign(
      {
        userId: user.id,
        companyId: companyId,
        role: user.role,
      },
      jwtSecret,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      }
    );

    if (!token) {
      console.error('❌ Token oluşturulamadı!');
      process.exit(1);
    }
    console.log('✅ Token oluşturuldu');

    // 8. Token doğrulama testi
    console.log('\n8️⃣ Token doğrulanıyor...');
    const decoded = jwt.verify(token, jwtSecret) as any;
    if (!decoded || decoded.userId !== user.id) {
      console.error('❌ Token doğrulanamadı!');
      process.exit(1);
    }
    console.log('✅ Token doğrulandı');

    console.log('\n✅ Tüm testler başarılı! Login işlemi çalışmalı.');
    console.log('\n📋 Özet:');
    console.log(`   - Kullanıcı: ${user.email}`);
    console.log(`   - Rol: ${user.role}`);
    console.log(`   - Company: ${user.company?.name || 'N/A'}`);
    console.log(`   - Token: ${token.substring(0, 20)}...`);

  } catch (error: any) {
    console.error('\n❌ Test hatası:', error);
    console.error('   Message:', error?.message);
    console.error('   Stack:', error?.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin()
  .then(() => {
    console.log('\n✅ Test tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test hatası:', error);
    process.exit(1);
  });

