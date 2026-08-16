declare module 'passport-apple' {
	import { Strategy as PassportStrategy } from 'passport-strategy';

	export interface AppleStrategyOptions {
		clientID: string;
		teamID: string;
		keyID: string;
		privateKeyString: string;
		callbackURL?: string;
		passReqToCallback?: boolean;
	}

	export class Strategy extends PassportStrategy {
		constructor(options: AppleStrategyOptions, verify?: (...args: unknown[]) => void);
		name: string;
	}
}
