/**
 * Standart Application Error Sınıfı
 * 
 * Tüm sistemde tutarlı exception handling için kullanılır.
 * Controller'larda try/catch yerine doğrudan throw edilir.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: any;
  public readonly code?: string; // Error code for programmatic handling

  constructor(
    message: string,
    statusCode: number = 400,
    errors?: any,
    isOperational: boolean = true,
    code?: string
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    this.code = code;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Factory methods for common errors
   */
  static badRequest(message: string, errors?: any): AppError {
    return new AppError(message, 400, errors);
  }

  static unauthorized(message: string = 'Yetkisiz erişim'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message: string = 'Bu işlem için yetkiniz yok'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Kayıt bulunamadı', code?: string): AppError {
    return new AppError(message, 404, undefined, true, code || ErrorCode.NOT_FOUND);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, undefined, true, code || ErrorCode.CONFLICT);
  }

  static validation(message: string, errors: any): AppError {
    return new AppError(message, 422, errors, true, ErrorCode.VALIDATION_ERROR);
  }

  static internal(message: string = 'Sunucu hatası'): AppError {
    return new AppError(message, 500, undefined, false);
  }

  /**
   * Multi-tenant specific errors
   */
  static companyMismatch(message: string = 'Bu kaynağa erişim yetkiniz yok'): AppError {
    return new AppError(message, 403);
  }

  static companyRequired(message: string = 'Şirket bilgisi gerekli'): AppError {
    return new AppError(message, 400);
  }

  /**
   * Integration specific errors
   */
  static integrationError(message: string, integrationName?: string): AppError {
    const fullMessage = integrationName 
      ? `${integrationName} entegrasyonu: ${message}`
      : message;
    return new AppError(fullMessage, 500);
  }

  static integrationNotActive(integrationName: string): AppError {
    return new AppError(`${integrationName} entegrasyonu aktif değil`, 400);
  }

  /**
   * Stock specific errors
   */
  static insufficientStock(
    productName: string,
    requested: number,
    available: number
  ): AppError {
    return new AppError(
      `Yetersiz stok: ${productName} için ${requested} adet istendi, ${available} adet mevcut`,
      400
    );
  }

  /**
   * JSON serialize edilebilir format
   */
  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      errors: this.errors,
    };
  }
}

/**
 * Error codes for programmatic error handling
 */
export enum ErrorCode {
  // General
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // Product
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_SKU_EXISTS = 'PRODUCT_SKU_EXISTS',
  PRODUCT_BARCODE_EXISTS = 'PRODUCT_BARCODE_EXISTS',
  
  // Order
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_ALREADY_PROCESSED = 'ORDER_ALREADY_PROCESSED',
  ORDER_CANNOT_BE_CANCELLED = 'ORDER_CANNOT_BE_CANCELLED',
  
  // Stock
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  STOCK_NOT_FOUND = 'STOCK_NOT_FOUND',
  
  // Warehouse
  WAREHOUSE_NOT_FOUND = 'WAREHOUSE_NOT_FOUND',
  DEFAULT_WAREHOUSE_NOT_FOUND = 'DEFAULT_WAREHOUSE_NOT_FOUND',
  
  // Integration
  INTEGRATION_NOT_FOUND = 'INTEGRATION_NOT_FOUND',
  INTEGRATION_NOT_ACTIVE = 'INTEGRATION_NOT_ACTIVE',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  
  // User
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_EMAIL_EXISTS = 'USER_EMAIL_EXISTS',
  USER_INACTIVE = 'USER_INACTIVE',
  
  // Company
  COMPANY_NOT_FOUND = 'COMPANY_NOT_FOUND',
  COMPANY_NOT_APPROVED = 'COMPANY_NOT_APPROVED',
  
  // Picking Wave
  PICKING_WAVE_NOT_FOUND = 'PICKING_WAVE_NOT_FOUND',
  PICKING_WAVE_INVALID_STATUS = 'PICKING_WAVE_INVALID_STATUS',
  
  // Location
  LOCATION_NOT_FOUND = 'LOCATION_NOT_FOUND',
  LOCATION_CODE_EXISTS = 'LOCATION_CODE_EXISTS',
}

