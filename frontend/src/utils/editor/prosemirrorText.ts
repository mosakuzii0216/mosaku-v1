import type { JSONContent } from '@tiptap/react';

interface Part {
	text: string;
	inline: boolean;
}

function gatherParts(nodes: JSONContent[]): Part[] {
	const parts: Part[] = [];
	for (const node of nodes) {
		if (node.type === 'text') {
			if (node.text) {
				parts.push({ text: node.text, inline: true });
			}
		} else if (node.type === 'hardBreak') {
			parts.push({ text: ' ', inline: true });
		} else if (node.content && node.content.length > 0) {
			const childParts = gatherParts(node.content);
			const childText = joinParts(childParts);
			if (childText) {
				parts.push({ text: childText, inline: false });
			}
		}
	}
	return parts;
}

function joinParts(parts: Part[]): string {
	let result = '';
	for (let i = 0; i < parts.length; i++) {
		if (i === 0) {
			result = parts[i].text;
		} else {
			const sep = parts[i - 1].inline && parts[i].inline ? '' : ' ';
			result += sep + parts[i].text;
		}
	}
	return result;
}

export function extractPlainText(content: JSONContent | null | undefined): string {
	if (!content || !content.content || content.content.length === 0) {
		return '';
	}
	return joinParts(gatherParts(content.content)).trim();
}

export function createEmptyDoc(): JSONContent {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}
