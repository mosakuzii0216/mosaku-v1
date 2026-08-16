import React from 'react';
import { NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from '@tiptap/react';
import { CALLOUT_VARIANTS, resolveCalloutVariant } from './calloutVariants';

/**
 * コールアウトの NodeView。種別変更（select）と削除（button）の操作 UI のみを担う。
 * アイコン・配色は CSS（`data-variant` 属性セレクタ）が解決するため、ここでは扱わない。
 *
 * 公開ビュー（`editor.isEditable === false`）では操作 UI を描画しない
 * （TaskItem チェックボックスと同じ「読み取り専用は editor.isEditable で判定」規約。
 * detailsPublicToggle.spike.test.ts 参照）。
 */
export const CalloutView: React.FC<ReactNodeViewProps> = ({
	node,
	updateAttributes,
	deleteNode,
	editor,
}) => {
	const variant = resolveCalloutVariant(node.attrs.variant as string | null | undefined).name;
	const isEditable = editor.isEditable;

	return (
		<NodeViewWrapper data-callout="" data-variant={variant} className="callout-node">
			{isEditable && (
				<div className="callout-node__toolbar" contentEditable={false}>
					<select
						aria-label="コールアウト種別"
						value={variant}
						onChange={(event) => updateAttributes({ variant: event.target.value })}
					>
						{CALLOUT_VARIANTS.map((v) => (
							<option key={v.name} value={v.name}>
								{v.icon} {v.label}
							</option>
						))}
					</select>
					<button type="button" aria-label="コールアウトを削除" onClick={() => deleteNode()}>
						削除
					</button>
				</div>
			)}
			<NodeViewContent className="callout-node__content" />
		</NodeViewWrapper>
	);
};
