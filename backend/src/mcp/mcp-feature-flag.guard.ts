import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isFeatureEnabled } from '../config/features.config';

/**
 * feature flag（FEATURE_MCP_ENDPOINT）が OFF のとき 404 を返すガード。
 *
 * McpBearerGuard より先に実行することで、flag OFF 時はトークン検証すら行わずに
 * エンドポイントを即時無効化できる（flag off でも 401 を返さない設計）。
 */
@Injectable()
export class McpFeatureFlagGuard implements CanActivate {
	canActivate(): boolean {
		if (!isFeatureEnabled('MCP_ENDPOINT')) {
			throw new NotFoundException();
		}
		return true;
	}
}
