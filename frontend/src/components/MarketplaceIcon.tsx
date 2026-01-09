import { ShoppingBag, Package, Store, Zap } from 'lucide-react';
import { cn } from '@/utils';

interface MarketplaceIconProps {
  type: string;
  className?: string;
}

export default function MarketplaceIcon({ type, className }: MarketplaceIconProps) {
  const getIcon = () => {
    switch (type?.toUpperCase()) {
      case 'WOOCOMMERCE':
        return <ShoppingBag className="w-5 h-5" />;
      case 'AMAZON':
        return <Package className="w-5 h-5" />;
      case 'TRENDYOL':
        return <Store className="w-5 h-5" />;
      case 'PAZARAMA':
        return <Zap className="w-5 h-5" />;
      case 'HEPSIBURADA':
        return <Store className="w-5 h-5" />;
      case 'N11':
        return <Store className="w-5 h-5" />;
      default:
        return <ShoppingBag className="w-5 h-5" />;
    }
  };

  const getColor = () => {
    switch (type?.toUpperCase()) {
      case 'WOOCOMMERCE':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'AMAZON':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'TRENDYOL':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'PAZARAMA':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'HEPSIBURADA':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'N11':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'SHOPIFY':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'IKAS':
        return 'bg-indigo-100 text-indigo-700 border-indigo-300';
      default:
        return 'bg-secondary-100 text-secondary-600 border-secondary-300';
    }
  };

  return (
    <div className={cn('rounded-lg flex items-center justify-center shadow-sm border-2', getColor(), className)}>
      {getIcon()}
    </div>
  );
}

