import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OAuth認証ガード
 * 各プロバイダーのPassport戦略に対応するガードを提供
 */

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}

@Injectable()
export class GitHubAuthGuard extends AuthGuard('github') {}
