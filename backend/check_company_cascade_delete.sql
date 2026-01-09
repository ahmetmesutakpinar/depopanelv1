-- ============================================
-- Company Cascade Delete Kontrol Script
-- ============================================
-- Bu script, company silme işleminde cascade delete'in
-- düzgün çalışıp çalışmadığını kontrol eder.

-- 1. Company'ye bağlı tüm foreign key constraint'leri kontrol et
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'companies'
    AND ccu.column_name = 'id'
ORDER BY tc.table_name, tc.constraint_name;

-- 2. Eğer delete_rule 'NO ACTION' veya 'RESTRICT' ise, bu bir sorundur
-- Tüm companyId foreign key'ler 'CASCADE' olmalıdır (warehouse hariç - RESTRICT olabilir)

-- 3. Silinen bir company'nin verilerini kontrol et (örnek)
-- SELECT COUNT(*) FROM products WHERE "companyId" = 'SİLİNEN_COMPANY_ID';
-- SELECT COUNT(*) FROM orders WHERE "companyId" = 'SİLİNEN_COMPANY_ID';
-- SELECT COUNT(*) FROM users WHERE "companyId" = 'SİLİNEN_COMPANY_ID';

