import { registerDecorator, type ValidationOptions } from 'class-validator';

export interface ProseMirrorMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface ProseMirrorNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: ProseMirrorNode[];
	marks?: ProseMirrorMark[];
	text?: string;
}

export interface ProseMirrorDoc extends ProseMirrorNode {
	type: 'doc';
	content?: ProseMirrorNode[];
}

export function isProseMirrorDoc(value: unknown): value is ProseMirrorDoc {
	if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	if (obj['type'] !== 'doc') {
		return false;
	}
	if (obj['content'] !== undefined) {
		if (!Array.isArray(obj['content'])) {
			return false;
		}
		for (const node of obj['content'] as unknown[]) {
			if (node === null || typeof node !== 'object' || Array.isArray(node)) {
				return false;
			}
			if (typeof (node as Record<string, unknown>)['type'] !== 'string') {
				return false;
			}
		}
	}
	return true;
}

export function isEmptyDoc(doc: ProseMirrorDoc): boolean {
	if (!doc.content || doc.content.length === 0) {
		return true;
	}
	if (doc.content.length === 1) {
		const node = doc.content[0];
		return node.type === 'paragraph' && (!node.content || node.content.length === 0);
	}
	return false;
}

export function createEmptyDoc(): ProseMirrorDoc {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function IsProseMirrorDoc(
	options?: { nullable?: boolean },
	validationOptions?: ValidationOptions,
): PropertyDecorator {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isProseMirrorDoc',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			constraints: [options?.nullable ?? false],
			validator: {
				validate(value: unknown, args: import('class-validator').ValidationArguments): boolean {
					const [nullable] = args.constraints as [boolean];
					if (value === null || value === undefined) {
						return nullable;
					}
					return isProseMirrorDoc(value);
				},
				defaultMessage(args: import('class-validator').ValidationArguments): string {
					return `${args.property} must be a valid ProseMirror doc ({ type: 'doc', content: [...] })`;
				},
			},
		});
	};
}
