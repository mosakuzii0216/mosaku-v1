declare module 'passport-line-auth' {
	import { Strategy as PassportStrategy } from 'passport-strategy';

	export interface LineStrategyOptions {
		channelID: string;
		channelSecret: string;
		callbackURL?: string;
		scope?: string[];
	}

	export class Strategy extends PassportStrategy {
		constructor(options: LineStrategyOptions, verify?: (...args: unknown[]) => void);
		name: string;
	}
}
