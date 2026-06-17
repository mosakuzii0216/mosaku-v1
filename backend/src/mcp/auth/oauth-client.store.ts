import { Injectable } from '@nestjs/common';
import type { McpOAuthClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type OAuthClientRecord = McpOAuthClient;

export interface OAuthClientCreateInput {
	clientName: string;
	redirectUris: string[];
	grantTypes: string[];
	tokenEndpointAuthMethod?: string;
	clientSecretHash?: string;
}

@Injectable()
export class OAuthClientStore {
	constructor(private readonly prisma: PrismaService) {}

	async create(input: OAuthClientCreateInput): Promise<OAuthClientRecord> {
		return this.prisma.mcpOAuthClient.create({
			data: {
				clientName: input.clientName,
				redirectUris: input.redirectUris,
				grantTypes: input.grantTypes,
				tokenEndpointAuthMethod: input.tokenEndpointAuthMethod ?? 'none',
				clientSecretHash: input.clientSecretHash ?? null,
			},
		});
	}

	async findById(id: string): Promise<OAuthClientRecord | null> {
		return this.prisma.mcpOAuthClient.findUnique({ where: { id } });
	}
}
