import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed başlatılıyor...');

  // ==================== SÜPER ADMİN HESABI ====================
  // Süper Admin: Şirket hesaplarını onaylar, backend yönetir, sistem yönetimi yapar
  
  // Create Super Admin Company (Sistem yönetimi için)
  const adminCompany = await prisma.company.upsert({
    where: { email: 'system@depopanel.com' },
    update: {},
    create: {
      name: 'DepoPanel Sistem Yönetimi',
      email: 'system@depopanel.com',
      phone: '+90 555 000 0000',
      status: 'APPROVED',
    },
  });

  console.log('✅ Sistem şirketi oluşturuldu:', adminCompany.name);

  // Create Super Admin User
  const hashedPassword = await bcrypt.hash('Admin123!', 12);
  
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@depopanel.com' },
    update: {},
    create: {
      email: 'admin@depopanel.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      companyId: adminCompany.id,
      emailVerified: true,
    },
  });

  console.log('✅ Super Admin oluşturuldu:', superAdmin.email);
  console.log('   📧 E-posta: admin@depopanel.com');
  console.log('   🔑 Şifre: Admin123!');
  console.log('   👤 Rol: Süper Admin (Şirket yönetimi, sistem yönetimi)');

  // ==================== DEMO ŞİRKET HESABI ====================
  // Normal şirket: Depo yönetimi, sipariş yönetimi, stok takibi yapar

  // Create Demo Company
  const demoCompany = await prisma.company.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      name: 'Demo Şirket',
      email: 'demo@example.com',
      phone: '+90 555 111 1111',
      address: 'Ataşehir, İstanbul',
      taxNumber: '1234567890',
      status: 'APPROVED', // Süper Admin tarafından onaylanmış
    },
  });

  console.log('✅ Demo şirketi oluşturuldu:', demoCompany.name);

  // Create Demo Admin User
  const demoAdmin = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      password: hashedPassword,
      firstName: 'Demo',
      lastName: 'Admin',
      role: 'ADMIN',
      companyId: demoCompany.id,
      emailVerified: true,
    },
  });

  console.log('✅ Demo Admin oluşturuldu:', demoAdmin.email);
  console.log('   📧 E-posta: demo@example.com');
  console.log('   🔑 Şifre: Admin123!');
  console.log('   👤 Rol: Admin (Şirket yönetimi)');

  // Create Demo Warehouses
  const warehouses = [
    { name: 'Ana Depo', code: 'ANA001', city: 'İstanbul', isDefault: true },
    { name: 'İstim Depo', code: 'IST001', city: 'İstanbul', isDefault: false },
    { name: 'Ferhatpaşa Depo', code: 'FER001', city: 'İstanbul', isDefault: false },
    { name: 'Mağaza', code: 'MAG001', city: 'İstanbul', isDefault: false },
  ];

  for (const wh of warehouses) {
    await prisma.warehouse.upsert({
      where: {
        companyId_code: {
          companyId: demoCompany.id,
          code: wh.code,
        },
      },
      update: {},
      create: {
        ...wh,
        companyId: demoCompany.id,
      },
    });
  }

  console.log('✅ Demo depoları oluşturuldu');

  // Get default warehouse for demo company
  const demoDefaultWarehouse = await prisma.warehouse.findFirst({
    where: { companyId: demoCompany.id, isDefault: true },
  });

  // Create Demo Categories
  const categories = [
    { name: 'Elektronik', slug: 'elektronik' },
    { name: 'Giyim', slug: 'giyim' },
    { name: 'Ev & Yaşam', slug: 'ev-yasam' },
    { name: 'Kozmetik', slug: 'kozmetik' },
  ];

  const createdCategories: Record<string, any> = {};

  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: {
        companyId_slug: {
          companyId: demoCompany.id,
          slug: cat.slug,
        },
      },
      update: {},
      create: {
        ...cat,
        companyId: demoCompany.id,
      },
    });
    createdCategories[cat.slug] = category;
  }

  console.log('✅ Demo kategorileri oluşturuldu');

  // Create Demo Products with EAN barcodes
  const products = [
    { sku: 'ELEC-001', barcode: '8690000000001', name: 'Kablosuz Kulaklık', price: 299.99, categorySlug: 'elektronik' },
    { sku: 'ELEC-002', barcode: '8690000000002', name: 'Akıllı Saat', price: 1499.99, categorySlug: 'elektronik' },
    { sku: 'ELEC-003', barcode: '8690000000003', name: 'Bluetooth Hoparlör', price: 449.99, categorySlug: 'elektronik' },
    { sku: 'GIY-001', barcode: '8690000000004', name: 'Erkek Tişört', price: 149.99, categorySlug: 'giyim' },
    { sku: 'GIY-002', barcode: '8690000000005', name: 'Kadın Elbise', price: 349.99, categorySlug: 'giyim' },
    { sku: 'GIY-003', barcode: '8690000000006', name: 'Unisex Sweatshirt', price: 249.99, categorySlug: 'giyim' },
    { sku: 'EV-001', barcode: '8690000000007', name: 'Dekoratif Yastık', price: 79.99, categorySlug: 'ev-yasam' },
    { sku: 'EV-002', barcode: '8690000000008', name: 'LED Masa Lambası', price: 199.99, categorySlug: 'ev-yasam' },
    { sku: 'KOZ-001', barcode: '8690000000009', name: 'Yüz Bakım Seti', price: 399.99, categorySlug: 'kozmetik' },
    { sku: 'KOZ-002', barcode: '8690000000010', name: 'Parfüm 100ml', price: 599.99, categorySlug: 'kozmetik' },
  ];

  const createdProducts: Record<string, any> = {};

  for (const prod of products) {
    const product = await prisma.product.upsert({
      where: {
        companyId_sku: {
          companyId: demoCompany.id,
          sku: prod.sku,
        },
      },
      update: {
        barcode: prod.barcode,
      },
      create: {
        sku: prod.sku,
        barcode: prod.barcode,
        name: prod.name,
        price: prod.price,
        costPrice: prod.price * 0.6,
        taxRate: 18,
        categoryId: createdCategories[prod.categorySlug]?.id,
        companyId: demoCompany.id,
      },
    });

    createdProducts[prod.sku] = product;

    // Create initial stock
    if (demoDefaultWarehouse) {
      const existingStock = await prisma.stock.findFirst({
        where: {
          productId: product.id,
          warehouseId: demoDefaultWarehouse.id,
          variantId: null,
        },
      });

      if (!existingStock) {
        await prisma.stock.create({
          data: {
            productId: product.id,
            warehouseId: demoDefaultWarehouse.id,
            quantity: Math.floor(Math.random() * 100) + 10,
            minQuantity: 5,
          },
        });
      }
    }
  }

  console.log('✅ Demo ürünleri ve stokları oluşturuldu');

  // Create Demo Orders (PENDING status for order picking)
  const demoOrders = [
    {
      orderNumber: 'SIP-2024-001',
      marketplaceOrderId: 'WOO-12345',
      customerName: 'Ahmet Yılmaz',
      customerEmail: 'ahmet@example.com',
      customerPhone: '+90 532 111 2233',
      shippingAddress: 'Kadıköy, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'ELEC-001', quantity: 2, price: 299.99 },
        { sku: 'GIY-001', quantity: 1, price: 149.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-002',
      marketplaceOrderId: 'TY-67890',
      customerName: 'Fatma Demir',
      customerEmail: 'fatma@example.com',
      customerPhone: '+90 533 222 3344',
      shippingAddress: 'Beşiktaş, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'KOZ-001', quantity: 1, price: 399.99 },
        { sku: 'KOZ-002', quantity: 2, price: 599.99 },
        { sku: 'EV-001', quantity: 3, price: 79.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-003',
      marketplaceOrderId: 'HB-11111',
      customerName: 'Mehmet Kaya',
      customerEmail: 'mehmet@example.com',
      customerPhone: '+90 534 333 4455',
      shippingAddress: 'Şişli, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'ELEC-002', quantity: 1, price: 1499.99 },
        { sku: 'ELEC-003', quantity: 1, price: 449.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-004',
      marketplaceOrderId: 'N11-22222',
      customerName: 'Ayşe Öztürk',
      customerEmail: 'ayse@example.com',
      customerPhone: '+90 535 444 5566',
      shippingAddress: 'Bakırköy, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'GIY-002', quantity: 1, price: 349.99 },
        { sku: 'GIY-003', quantity: 2, price: 249.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-005',
      marketplaceOrderId: 'WOO-33333',
      customerName: 'Ali Çelik',
      customerEmail: 'ali@example.com',
      customerPhone: '+90 536 555 6677',
      shippingAddress: 'Üsküdar, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'EV-002', quantity: 2, price: 199.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-006',
      marketplaceOrderId: 'TY-44444',
      customerName: 'Zeynep Arslan',
      customerEmail: 'zeynep@example.com',
      customerPhone: '+90 537 666 7788',
      shippingAddress: 'Maltepe, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'ELEC-001', quantity: 1, price: 299.99 },
        { sku: 'GIY-003', quantity: 1, price: 249.99 },
        { sku: 'EV-001', quantity: 2, price: 79.99 },
      ],
    },
    {
      orderNumber: 'SIP-2024-007',
      marketplaceOrderId: 'HB-55555',
      customerName: 'Can Yıldız',
      customerEmail: 'can@example.com',
      customerPhone: '+90 538 777 8899',
      shippingAddress: 'Kartal, İstanbul',
      status: 'PENDING',
      items: [
        { sku: 'ELEC-002', quantity: 1, price: 1499.99 },
        { sku: 'KOZ-001', quantity: 1, price: 399.99 },
      ],
    },
  ];

  for (const orderData of demoOrders) {
    // Check if order exists
    const existingOrder = await prisma.order.findFirst({
      where: {
        companyId: demoCompany.id,
        orderNumber: orderData.orderNumber,
      },
    });

    if (!existingOrder) {
      // Calculate totals
      const subtotal = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const taxAmount = subtotal * 0.18;
      const total = subtotal + taxAmount;

      const order = await prisma.order.create({
        data: {
          orderNumber: orderData.orderNumber,
          marketplaceOrderId: orderData.marketplaceOrderId,
          status: orderData.status as any,
          customerName: orderData.customerName,
          customerEmail: orderData.customerEmail,
          customerPhone: orderData.customerPhone,
          shippingAddress: orderData.shippingAddress,
          subtotal,
          taxAmount,
          shippingCost: 0,
          total,
          companyId: demoCompany.id,
          warehouseId: demoDefaultWarehouse!.id,
        },
      });

      // Create order items
      for (const item of orderData.items) {
        const product = createdProducts[item.sku];
        if (product) {
          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              sku: item.sku,
              name: product.name,
              quantity: item.quantity,
              unitPrice: item.price,
              taxRate: 18,
              total: item.price * item.quantity,
            },
          });
        }
      }
    }
  }

  console.log('✅ Demo siparişleri oluşturuldu');

  console.log('');
  console.log('🎉 Seed tamamlandı!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 OLUŞTURULAN HESAPLAR:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('1️⃣  SÜPER ADMİN (Şirket Yönetimi)');
  console.log('   📧 E-posta: admin@depopanel.com');
  console.log('   🔑 Şifre: Admin123!');
  console.log('   👤 Rol: Süper Admin');
  console.log('   📝 Görevler:');
  console.log('      • Şirket hesaplarını onaylama/reddetme');
  console.log('      • Sistem sağlığını görüntüleme');
  console.log('      • Destek taleplerini yönetme');
  console.log('      • Tüm şirketleri görüntüleme');
  console.log('');
  console.log('2️⃣  DEMO ŞİRKET (Normal Kullanım)');
  console.log('   📧 E-posta: demo@example.com');
  console.log('   🔑 Şifre: Admin123!');
  console.log('   👤 Rol: Admin');
  console.log('   📝 Görevler:');
  console.log('      • Depo yönetimi');
  console.log('      • Sipariş yönetimi');
  console.log('      • Stok takibi');
  console.log('      • Kullanıcı yönetimi (kendi şirketi)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
