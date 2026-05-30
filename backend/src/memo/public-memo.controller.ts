import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { MemoSharingService } from './memo-sharing.service';

class GetPublicMemoParamsDto {
	@IsString()
	@Length(20, 64)
	@Matches(/^[A-Za-z0-9_-]+$/)
	token: string;
}

@Public()
@Controller('memos/public')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class PublicMemoController {
	constructor(private readonly memoSharingService: MemoSharingService) {}

	@Get(':token')
	@Header('Cache-Control', 'private, max-age=30, must-revalidate')
	@Header('Vary', 'Accept')
	findByToken(@Param() params: GetPublicMemoParamsDto) {
		return this.memoSharingService.findByToken(params.token);
	}
}
