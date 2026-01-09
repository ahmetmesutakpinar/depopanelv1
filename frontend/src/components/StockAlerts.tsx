import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package, ArrowRight } from 'lucide-react';
import { Card, CardBody, Badge, Button } from './ui';
import { formatNumber } from '@/utils';
import api from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export default function StockAlerts() {
  const navigate = useNavigate();
  
  const { data: lowStockData, isLoading } = useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: () => api.getLowStockProducts(),
  });

  const lowStockProducts = lowStockData?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (lowStockProducts.length === 0) {
    return null;
  }

  return (
    <Card className="border-warning-200 bg-warning-50">
      <CardBody className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning-600" />
            <h3 className="font-semibold text-warning-900">
              Düşük Stok Uyarısı
            </h3>
            <Badge variant="warning">{lowStockProducts.length}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${ROUTES.PRODUCTS}?lowStock=true`)}
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {lowStockProducts.slice(0, 5).map((product: any) => {
            const criticalStock = product.stocks?.find((s: any) => 
              s.quantity <= s.minQuantity && s.minQuantity > 0
            );
            
            return (
              <div
                key={product.id}
                className="flex items-center justify-between p-2 bg-white rounded-lg border border-warning-200 hover:border-warning-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-secondary-900 truncate">
                    {product.name}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {criticalStock?.warehouse?.name || 'Depo'}
                    {' • '}
                    Stok: {formatNumber(criticalStock?.quantity || 0)} / Min: {formatNumber(criticalStock?.minQuantity || 0)}
                  </p>
                </div>
                <Badge variant="danger" className="ml-2">
                  Kritik
                </Badge>
              </div>
            );
          })}
        </div>

        {lowStockProducts.length > 5 && (
          <p className="text-xs text-warning-700 mt-2 text-center">
            +{lowStockProducts.length - 5} ürün daha
          </p>
        )}
      </CardBody>
    </Card>
  );
}

