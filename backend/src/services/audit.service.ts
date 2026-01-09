import { prisma } from '../config/index.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export enum AuditResource {
  USER = 'USER',
  COMPANY = 'COMPANY',
  PRODUCT = 'PRODUCT',
  ORDER = 'ORDER',
  STOCK = 'STOCK',
  WAREHOUSE = 'WAREHOUSE',
  INTEGRATION = 'INTEGRATION',
  SETTING = 'SETTING',
}

export interface AuditLogData {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  entityType?: AuditResource;
  entityId?: string;
  userId: string;
  companyId: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditService {
  /**
   * Create audit log
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO audit_logs (
          id, action, resource, resource_id, user_id, company_id, 
          details, ip_address, user_agent, created_at
        ) VALUES (
          gen_random_uuid(),
          ${data.action},
          ${data.resource},
          ${data.resourceId || null},
          ${data.userId},
          ${data.companyId},
          ${data.details ? JSON.stringify(data.details) : null},
          ${data.ipAddress || null},
          ${data.userAgent || null},
          NOW()
        )
      `;
    } catch (error: any) {
      // Don't throw - audit logging should not break the application
      const { logger } = await import('../utils/logger.js');
      logger.error('[createAuditLog] Audit log kayıt hatası', {
        error: error?.message || String(error),
        stack: error?.stack,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
      });
    }
  }

  /**
   * Get audit logs
   */
  async getLogs(
    companyId: string,
    filters?: {
      userId?: string;
      resource?: AuditResource;
      action?: AuditAction;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    let query = `
      SELECT 
        al.*,
        u.email as user_email,
        u.first_name,
        u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.company_id = $1
    `;
    
    const params: any[] = [companyId];
    let paramIndex = 2;

    if (filters?.userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.resource) {
      query += ` AND al.resource = $${paramIndex}`;
      params.push(filters.resource);
      paramIndex++;
    }

    if (filters?.action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    return await prisma.$queryRawUnsafe(query, ...params);
  }
}

export const auditService = new AuditService();

