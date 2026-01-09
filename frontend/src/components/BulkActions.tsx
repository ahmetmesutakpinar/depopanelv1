import { useState } from 'react';
import { Check, X, Trash2, Download } from 'lucide-react';
import { Button } from './ui';

interface BulkActionsProps<T> {
  selectedItems: string[];
  items: T[];
  onSelectAll: (selected: boolean) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkUpdate?: (ids: string[], data: any) => void;
  onBulkExport?: (items: T[]) => void;
  getItemId: (item: T) => string;
  actions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: (ids: string[]) => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
}

export default function BulkActions<T>({
  selectedItems,
  items,
  onSelectAll,
  onBulkDelete,
  onBulkUpdate,
  onBulkExport,
  getItemId,
  actions = [],
}: BulkActionsProps<T>) {
  const [showActions, setShowActions] = useState(false);
  const allSelected = selectedItems.length === items.length && items.length > 0;
  const someSelected = selectedItems.length > 0 && selectedItems.length < items.length;

  if (selectedItems.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(input) => {
            if (input) input.indeterminate = someSelected;
          }}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
        />
        <span className="text-sm text-secondary-500">
          Tümünü seç ({items.length} öğe)
        </span>
      </div>
    );
  }

  const selectedItemsData = items.filter((item) =>
    selectedItems.includes(getItemId(item))
  );

  return (
    <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Check className="w-5 h-5 text-primary-600" />
          <span className="font-medium text-primary-900">
            {selectedItems.length} öğe seçildi
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectAll(false)}
        >
          <X className="w-4 h-4 mr-1" />
          Seçimi Kaldır
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {onBulkExport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onBulkExport(selectedItemsData)}
          >
            <Download className="w-4 h-4 mr-1" />
            Dışa Aktar
          </Button>
        )}

        {actions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant || 'secondary'}
            size="sm"
            onClick={() => action.onClick(selectedItems)}
          >
            {action.icon && <span className="mr-1">{action.icon}</span>}
            {action.label}
          </Button>
        ))}

        {onBulkDelete && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm(`${selectedItems.length} öğeyi silmek istediğinize emin misiniz?`)) {
                onBulkDelete(selectedItems);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Sil ({selectedItems.length})
          </Button>
        )}
      </div>
    </div>
  );
}

