import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button, Input, Select, Card, CardBody } from './ui';

interface FilterOption {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'dateRange';
  options?: Array<{ value: string; label: string }>;
}

interface AdvancedFiltersProps {
  filters: FilterOption[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onReset: () => void;
}

export default function AdvancedFilters({
  filters,
  values,
  onChange,
  onReset,
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localValues, setLocalValues] = useState(values);

  const activeFiltersCount = Object.values(values).filter(
    (v) => v !== '' && v !== null && v !== undefined
  ).length;

  const handleChange = (key: string, value: any) => {
    const newValues = { ...localValues, [key]: value };
    setLocalValues(newValues);
    onChange(newValues);
  };

  const handleReset = () => {
    const emptyValues = filters.reduce((acc, filter) => {
      acc[filter.key] = '';
      return acc;
    }, {} as Record<string, any>);
    setLocalValues(emptyValues);
    onReset();
  };

  const hasActiveFilters = activeFiltersCount > 0;

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Filter className="w-4 h-4 mr-2" />
        Gelişmiş Filtreler
        {hasActiveFilters && (
          <span className="ml-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
            {activeFiltersCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <Card className="absolute top-full left-0 mt-2 z-50 w-96 shadow-xl">
            <CardBody className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-secondary-900">Filtreler</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-secondary-400 hover:text-secondary-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {filters.map((filter) => (
                  <div key={filter.key}>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">
                      {filter.label}
                    </label>
                    {filter.type === 'text' && (
                      <Input
                        value={localValues[filter.key] || ''}
                        onChange={(e) => handleChange(filter.key, e.target.value)}
                        placeholder={`${filter.label} ara...`}
                      />
                    )}
                    {filter.type === 'select' && filter.options && (
                      <Select
                        options={[
                          { value: '', label: 'Tümü' },
                          ...filter.options,
                        ]}
                        value={localValues[filter.key] || ''}
                        onChange={(e) => handleChange(filter.key, e.target.value)}
                      />
                    )}
                    {filter.type === 'date' && (
                      <Input
                        type="date"
                        value={localValues[filter.key] || ''}
                        onChange={(e) => handleChange(filter.key, e.target.value)}
                      />
                    )}
                    {filter.type === 'dateRange' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-secondary-500 mb-1 block">
                            Başlangıç
                          </label>
                          <Input
                            type="date"
                            value={localValues[`${filter.key}Start`] || ''}
                            onChange={(e) =>
                              handleChange(`${filter.key}Start`, e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-secondary-500 mb-1 block">
                            Bitiş
                          </label>
                          <Input
                            type="date"
                            value={localValues[`${filter.key}End`] || ''}
                            onChange={(e) =>
                              handleChange(`${filter.key}End`, e.target.value)
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={!hasActiveFilters}
                >
                  <X className="w-4 h-4 mr-1" />
                  Temizle
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  Uygula
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

