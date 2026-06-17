import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { InvitationStateInvalidException } from './x-register-start.exception';
import { ConfigService } from '../config/config.service';

@Catch(InvitationStateInvalidException)
@Injectable()
export class InvitationStateInvalidFilter implements ExceptionFilter {
	constructor(private readonly configService: ConfigService) {}

	catch(exception: InvitationStateInvalidException, host: ArgumentsHost): void {
		const res = host.switchToHttp().getResponse<Response>();
		const url = this.configService.generateInvitationStateInvalidUrl(exception.invitationCode);
		res.redirect(url);
	}
}
