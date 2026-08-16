import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '../config/config.service';
import { ERROR_CODES, throwForbidden } from '../common/exceptions';

const REFRESH_REQUEST_HEADER = 'x-refresh-request';
const REFRESH_REQUEST_EXPECTED_VALUE = '1';

@Injectable()
export class RefreshCsrfGuard implements CanActivate {
	constructor(private readonly configService: ConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const origin = this.headerValue(request.headers.origin);
		const refreshHeader = this.headerValue(request.headers[REFRESH_REQUEST_HEADER]);

		const allowedOrigins = this.configService.corsOrigins;
		if (!origin || !allowedOrigins.includes(origin)) {
			throwForbidden(ERROR_CODES.AUTHZ.FORBIDDEN);
		}

		if (refreshHeader !== REFRESH_REQUEST_EXPECTED_VALUE) {
			throwForbidden(ERROR_CODES.AUTHZ.FORBIDDEN);
		}

		return true;
	}

	private headerValue(raw: string | string[] | undefined): string | undefined {
		if (Array.isArray(raw)) {
			return raw[0];
		}
		return raw;
	}
}
