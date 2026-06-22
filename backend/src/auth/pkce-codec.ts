import { randomBytes, createHash } from 'crypto';

export interface PkcePair {
	readonly verifier: string; // base64url(randomBytes(32)) = 43 文字
	readonly challenge: string; // base64url(sha256(verifier))
}

export function generatePkcePair(): PkcePair {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}
