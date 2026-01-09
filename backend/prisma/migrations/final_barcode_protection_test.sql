-- ============================================
-- FINAL BARCODE PROTECTION: Comprehensive Test
-- ============================================

-- STEP 1: Verify index exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'products' 
            AND indexname = 'products_company_barcode_unique'
        ) THEN '✅ Index exists'
        ELSE '❌ Index NOT found'
    END as index_status;

-- STEP 2: Get test data (existing company and barcode)
DO $$
DECLARE
    test_company_id TEXT;
    test_barcode TEXT;
    test_company_id_2 TEXT;
BEGIN
    -- Get first company with a barcode
    SELECT "companyId", "barcode" INTO test_company_id, test_barcode
    FROM products
    WHERE "barcode" IS NOT NULL
    LIMIT 1;
    
    -- Get a different company
    SELECT id INTO test_company_id_2
    FROM companies
    WHERE id != test_company_id
    LIMIT 1;
    
    IF test_company_id IS NULL OR test_barcode IS NULL THEN
        RAISE NOTICE '⚠️  No test data available (no products with barcode)';
        RETURN;
    END IF;
    
    RAISE NOTICE '📋 Test Data:';
    RAISE NOTICE '   Company 1: %', test_company_id;
    RAISE NOTICE '   Company 2: %', COALESCE(test_company_id_2, 'N/A');
    RAISE NOTICE '   Test Barcode: %', test_barcode;
    
    -- STEP 3: Test 1 - Try to insert duplicate barcode (same company)
    -- This SHOULD FAIL
    BEGIN
        INSERT INTO products (
            "companyId", "sku", "barcode", "name", "price", "taxRate"
        ) VALUES (
            test_company_id, 
            'TEST-DUPLICATE-' || gen_random_uuid()::TEXT,
            test_barcode,
            'Test Duplicate Product',
            100.00,
            20.00
        );
        RAISE NOTICE '❌ TEST 1 FAILED: Duplicate barcode was allowed!';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE '✅ TEST 1 PASSED: Duplicate barcode correctly rejected';
        WHEN OTHERS THEN
            RAISE NOTICE '⚠️  TEST 1 ERROR: %', SQLERRM;
    END;
    
    -- STEP 4: Test 2 - Try to insert same barcode (different company)
    -- This SHOULD PASS
    IF test_company_id_2 IS NOT NULL THEN
        BEGIN
            INSERT INTO products (
                "companyId", "sku", "barcode", "name", "price", "taxRate"
            ) VALUES (
                test_company_id_2,
                'TEST-CROSS-COMPANY-' || gen_random_uuid()::TEXT,
                test_barcode,
                'Test Cross-Company Product',
                100.00,
                20.00
            );
            RAISE NOTICE '✅ TEST 2 PASSED: Same barcode in different company allowed';
            
            -- Clean up
            DELETE FROM products 
            WHERE "sku" LIKE 'TEST-CROSS-COMPANY-%' 
            AND "companyId" = test_company_id_2;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '❌ TEST 2 FAILED: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '⚠️  TEST 2 SKIPPED: Only one company available';
    END IF;
    
    -- STEP 5: Test 3 - Try to insert NULL barcode
    -- This SHOULD PASS
    BEGIN
        INSERT INTO products (
            "companyId", "sku", "barcode", "name", "price", "taxRate"
        ) VALUES (
            test_company_id,
            'TEST-NULL-BARCODE-' || gen_random_uuid()::TEXT,
            NULL,
            'Test NULL Barcode Product',
            100.00,
            20.00
        );
        RAISE NOTICE '✅ TEST 3 PASSED: NULL barcode allowed';
        
        -- Clean up
        DELETE FROM products 
        WHERE "sku" LIKE 'TEST-NULL-BARCODE-%' 
        AND "companyId" = test_company_id;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '❌ TEST 3 FAILED: %', SQLERRM;
    END;
    
END $$;

-- STEP 6: Final verification - no duplicates exist
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No duplicate barcodes found'
        ELSE '❌ ' || COUNT(*) || ' duplicate barcode group(s) found'
    END as final_status
FROM (
    SELECT "companyId", "barcode", COUNT(*) as cnt
    FROM products
    WHERE "barcode" IS NOT NULL
    GROUP BY "companyId", "barcode"
    HAVING COUNT(*) > 1
) duplicates;

