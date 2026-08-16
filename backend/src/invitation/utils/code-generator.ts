import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';

export const NO_LOOK_ALIKE_ALPHABET = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtuvwxy';

export const NEW_CODE_LENGTH = 10;

const LEGACY_HEX_PATTERN = /^[0-9A-Fa-f]{32}$/;

export interface CodeGenerator {
	generate(): string;
	isLegacyFormat(code: string): boolean;
}

export const CODE_GENERATOR: unique symbol = Symbol('CODE_GENERATOR');

@Injectable()
export class NanoidCodeGenerator implements CodeGenerator {
	private readonly nanoid = customAlphabet(NO_LOOK_ALIKE_ALPHABET, NEW_CODE_LENGTH);

	generate(): string {
		return this.nanoid();
	}

	isLegacyFormat(code: string): boolean {
		return LEGACY_HEX_PATTERN.test(code);
	}
}
