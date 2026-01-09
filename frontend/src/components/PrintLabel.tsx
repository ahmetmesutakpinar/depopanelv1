import { useRef, useEffect } from 'react';
import { Printer } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { Button } from './ui';

interface PrintLabelProps {
  data: {
    productName: string;
    sku: string;
    barcode?: string;
    price?: number;
    warehouse?: string;
    location?: string;
  };
  type?: 'product' | 'barcode' | 'location';
}

export default function PrintLabel({ data, type = 'product' }: PrintLabelProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  // Generate barcode when component mounts or barcode changes
  useEffect(() => {
    if (data.barcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, data.barcode, {
          format: 'EAN13',
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 12,
        });
      } catch (error) {
        console.error('Barcode generation error:', error);
        // Fallback: try CODE128 if EAN13 fails
        try {
          JsBarcode(barcodeRef.current, data.barcode, {
            format: 'CODE128',
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 12,
          });
        } catch (e) {
          console.error('Barcode generation failed:', e);
        }
      }
    }
  }, [data.barcode]);

  const handlePrint = () => {
    if (!printRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up engelleyici aktif. Lütfen izin verin.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiket Yazdır</title>
          <style>
            @media print {
              @page {
                size: 50mm 30mm;
                margin: 2mm;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
              }
            }
            body {
              margin: 0;
              padding: 8px;
              font-family: Arial, sans-serif;
              font-size: 10px;
            }
            .label {
              border: 1px solid #000;
              padding: 4px;
              text-align: center;
            }
            .product-name {
              font-weight: bold;
              font-size: 11px;
              margin-bottom: 2px;
            }
            .sku {
              font-size: 9px;
              color: #666;
              margin-bottom: 2px;
            }
            .barcode {
              margin: 4px 0;
            }
            .price {
              font-size: 12px;
              font-weight: bold;
              margin-top: 2px;
            }
            .warehouse {
              font-size: 8px;
              color: #999;
            }
          </style>
        </head>
        <body>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <>
      <div ref={printRef} className="hidden">
        <div className="label">
          <div className="product-name">{data.productName}</div>
          {data.sku && <div className="sku">SKU: {data.sku}</div>}
          {data.barcode && (
            <div className="barcode">
              <svg ref={barcodeRef} id={`barcode-${data.sku}`}></svg>
            </div>
          )}
          {data.price && (
            <div className="price">{data.price.toFixed(2)} ₺</div>
          )}
          {data.warehouse && (
            <div className="warehouse">{data.warehouse}</div>
          )}
          {data.location && (
            <div className="warehouse">Lokasyon: {data.location}</div>
          )}
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={handlePrint}
        leftIcon={<Printer className="w-4 h-4" />}
      >
        Yazdır
      </Button>
    </>
  );
}

