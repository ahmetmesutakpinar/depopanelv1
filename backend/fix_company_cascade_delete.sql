-- ============================================
-- Company Cascade Delete Düzeltme Script
-- ============================================
-- Bu script, company silme işleminde cascade delete'in
-- düzgün çalışması için foreign key constraint'leri düzeltir.

-- ÖNEMLİ: Bu script'i çalıştırmadan önce yedek alın!

-- Tüm companyId foreign key constraint'lerini CASCADE olarak güncelle
-- (warehouse hariç - orders.warehouseId RESTRICT kalmalı)

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 
            tc.constraint_name,
            tc.table_name,
            kcu.column_name
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
            AND rc.delete_rule != 'CASCADE'
            AND NOT (tc.table_name = 'orders' AND kcu.column_name = 'warehouseId')
    LOOP
        EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
            r.table_name,
            r.constraint_name
        );
        
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE',
            r.table_name,
            r.constraint_name,
            r.column_name
        );
        
        RAISE NOTICE 'Updated constraint % on table %', r.constraint_name, r.table_name;
    END LOOP;
END $$;

-- Kontrol: Tüm constraint'lerin CASCADE olduğunu doğrula
SELECT 
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ OK'
        WHEN tc.table_name = 'orders' AND kcu.column_name = 'warehouseId' THEN '✅ OK (RESTRICT by design)'
        ELSE '❌ FIX NEEDED'
    END AS status
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
ORDER BY tc.table_name, kcu.column_name;

