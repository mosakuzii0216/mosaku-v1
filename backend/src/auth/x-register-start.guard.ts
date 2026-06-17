import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { InvitationStateService } from './invitation-state.service';
import { InvitationStateInvalidException } from './x-register-start.exception';

@Injectable()
export class XRegisterStartGuard extends AuthGuard('x') {
	constructor(private readonly invitationStateService: InvitationStateService) {
		super();
	}

	canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
		const req = context
			.switchToHttp()
			.getRequest<Request & { session?: Record<string, unknown> }>();
		const stateValue = (req.query as Record<string, unknown>).state;

		if (typeof stateValue !== 'string' || stateValue.length === 0) {
			throw new InvitationStateInvalidException('');
		}

		let code: string;
		try {
			const payload = this.invitationStateService.verifyState(stateValue, 'x');
			code = payload.code;
		} catch {
			throw new InvitationStateInvalidException(this.tryExtractCode(stateValue));
		}

		req.session = req.session ?? {};
		req.session.xInvitationCode = code;

		return super.canActivate(context);
	}

	private tryExtractCode(state: string): string {
		const dotIdx = state.indexOf('.');
		if (dotIdx <= 0) return '';
		try {
			const json = Buffer.from(state.slice(0, dotIdx), 'base64url').toString('utf8');
			const parsed = JSON.parse(json) as Record<string, unknown>;
			return typeof parsed.code === 'string' ? parsed.code : '';
		} catch {
			return '';
		}
	}
}
