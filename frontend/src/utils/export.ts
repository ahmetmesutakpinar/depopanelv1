/**
 * Excel/CSV export utilities
 */

interface ExportOptions {
  filename?: string;
  sheetName?: string;
}

/**
 * Export data to CSV
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: Array<{ key: keyof T; label: string; format?: (value: any) => string }>,
  options: ExportOptions = {}
): void {
  if (data.length === 0) {
    alert('Dışa aktarılacak veri yok');
    return;
  }

  // CSV header
  const headers = columns.map((col) => col.label).join(',');
  
  // CSV rows
  const rows = data.map((item) =>
    columns
      .map((col) => {
        const value = item[col.key];
        // Apply format function if provided
        if (col.format) {
          const formatted = col.format(value);
          // Escape commas and quotes
          if (formatted.includes(',') || formatted.includes('"')) {
            return `"${formatted.replace(/"/g, '""')}"`;
          }
          return formatted;
        }
        // Handle null/undefined
        if (value === null || value === undefined) return '';
        // Handle objects/arrays
        if (typeof value === 'object') return JSON.stringify(value);
        // Escape commas and quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',')
  );

  // Combine header and rows
  const csvContent = [headers, ...rows].join('\n');

  // Create blob and download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${options.filename || 'export'}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export data to Excel (XLSX) - uses exceljs library
 */
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  columns: Array<{ key: keyof T; label: string; format?: (value: any) => string }>,
  options: ExportOptions = {}
): Promise<void> {
  try {
    // Dynamic import for exceljs
    const ExcelJS = await import('exceljs');
    
    if (data.length === 0) {
      alert('Dışa aktarılacak veri yok');
      return;
    }

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Sheet1');

    // Add header row
    worksheet.addRow(columns.map((col) => col.label));
    
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    data.forEach((item) => {
      const row = columns.map((col) => {
        const value = item[col.key];
        if (col.format) return col.format(value);
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
      });
      worksheet.addRow(row);
    });

    // Set column widths
    columns.forEach((_, index) => {
      worksheet.getColumn(index + 1).width = 20;
    });

    // Generate file and download
    const filename = `${options.filename || 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Create blob and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Excel export error:', error);
    // Fallback to CSV
    exportToCSV(data, columns, options);
  }
}

/**
 * Format currency for export
 */
export function formatCurrencyForExport(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(value);
}

/**
 * Format date for export
 */
export function formatDateForExport(date: string | Date): string {
  return new Date(date).toLocaleDateString('tr-TR');
}

/**
 * Format datetime for export
 */
export function formatDateTimeForExport(date: string | Date): string {
  return new Date(date).toLocaleString('tr-TR');
}

