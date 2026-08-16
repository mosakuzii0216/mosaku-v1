import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { ConfigService } from '../config/config.service';

@Injectable()
export class OAuthStateCrypto {
	constructor(private readonly configService: ConfigService) {}

	/** AES-256-GCM で plaintext を封緘し、base64url(iv[12] | ciphertext | authTag[16]) を返す */
	seal(plaintext: string): string {
		const key = this.configService.oauthStateEncKey;
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([iv, ciphertext, tag]).toString('base64url');
	}

	/** sealed を開封し plaintext を返す。auth tag 不一致（改ざん）時は例外を投げる */
	open(sealed: string): string {
		const key = this.configService.oauthStateEncKey;
		const data = Buffer.from(sealed, 'base64url');
		const iv = data.subarray(0, 12);
		const tag = data.subarray(data.length - 16);
		const ciphertext = data.subarray(12, data.length - 16);
		const decipher = createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAuthTag(tag);
		try {
			const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
			return plaintext.toString('utf8');
		} catch {
			throw new Error('AES-GCM authentication failed: ciphertext may be tampered');
		}
	}
}
