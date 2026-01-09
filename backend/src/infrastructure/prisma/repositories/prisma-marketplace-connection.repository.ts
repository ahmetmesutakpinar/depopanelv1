/**
 * Prisma MarketplaceConnection Repository Implementation
 * 
 * Implements IMarketplaceConnectionRepository using Prisma ORM.
 * This is the infrastructure layer implementation.
 * 
 * Architecture:
 * - Implements repository interface (Dependency Inversion)
 * - Uses PrismaClient for database access
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 */

import { PrismaClient } from '@prisma/client';
import { IMarketplaceConnectionRepository, FindConnectionsOptions } from '../../../repositories/marketplace-connection.repository.interface.js';
import { MarketplaceConnection, MarketplaceType, IntegrationStatus } from '../../../domain/entities/marketplace-connection.entity.js';
import { CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { mapMarketplaceConnection } from './mappers.js';
import { Prisma } from '@prisma/client';

export class PrismaMarketplaceConnectionRepository implements IMarketplaceConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdAndCompany(id: string, companyId: CompanyId | string): Promise<MarketplaceConnection | null> {
    const record = await this.prisma.marketplaceIntegration.findFirst({
      where: {
        id,
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
    });

    if (!record) return null;
    return mapMarketplaceConnection(record);
  }

  async findByTypeAndCompany(type: MarketplaceType, companyId: CompanyId | string): Promise<MarketplaceConnection | null> {
    const record = await this.prisma.marketplaceIntegration.findFirst({
      where: {
        type,
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
    });

    if (!record) return null;
    return mapMarketplaceConnection(record);
  }

  async findByCompany(companyId: CompanyId | string, options?: FindConnectionsOptions): Promise<{
    connections: MarketplaceConnection[];
    total: number;
  }> {
    const where: Prisma.MarketplaceIntegrationWhereInput = {
      companyId: typeof companyId === 'string' ? companyId : companyId.value,
      ...(options?.type && { type: options.type }),
      ...(options?.status && { status: options.status }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [records, total] = await Promise.all([
      this.prisma.marketplaceIntegration.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketplaceIntegration.count({ where }),
    ]);

    return {
      connections: records.map(mapMarketplaceConnection),
      total,
    };
  }

  async create(connection: MarketplaceConnection): Promise<MarketplaceConnection> {
    // TODO: Extract syncMode and isReadOnly from connection and store in settings
    const settings = {
      ...(connection.settings || {}),
      syncMode: connection.syncMode,
      isReadOnly: connection.isReadOnly,
    };

    const record = await this.prisma.marketplaceIntegration.create({
      data: {
        type: connection.type,
        name: connection.name,
        companyId: connection.companyId,
        status: connection.status,
        settings: settings as Prisma.InputJsonValue,
        lastSyncAt: connection.lastSyncAt,
        // TODO: Map other fields (apiKey, apiSecret, etc.) if they exist in Prisma schema
      },
    });

    return mapMarketplaceConnection(record);
  }

  async update(id: string, connection: Partial<MarketplaceConnection>): Promise<MarketplaceConnection> {
    // TODO: Handle settings update properly
    const existing = await this.prisma.marketplaceIntegration.findUnique({
      where: { id },
      select: { settings: true },
    });

    const settings = existing?.settings as Record<string, unknown> || {};
    if (connection.syncMode !== undefined) {
      settings.syncMode = connection.syncMode;
    }
    if (connection.isReadOnly !== undefined) {
      settings.isReadOnly = connection.isReadOnly;
    }

    const record = await this.prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        ...(connection.name && { name: connection.name }),
        ...(connection.status && { status: connection.status }),
        ...(connection.lastSyncAt && { lastSyncAt: connection.lastSyncAt }),
        ...(connection.settings && { settings: { ...settings, ...connection.settings } as Prisma.InputJsonValue }),
        // TODO: Map other fields
      },
    });

    return mapMarketplaceConnection(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.marketplaceIntegration.delete({
      where: { id },
    });
  }

  async updateLastSyncAt(id: string, lastSyncAt: Date): Promise<void> {
    await this.prisma.marketplaceIntegration.update({
      where: { id },
      data: { lastSyncAt },
    });
  }
}

