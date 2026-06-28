import { useThemes } from '../../hooks/useThemeQueries';
import { useShellThemeStore } from '../../stores/useShellThemeStore';
import { getEffectKey } from '../../types/theme';

/*
 * ShellThemeSelector — シェル床（アプリ単位テーマ）の最小セレクタ（Task 4.6）
 * ======================================================================
 * 「テーマ管理（未実装）」プレースホルダの置き換え。システムテーマのうち effectKey を持つ
 * ものを一覧し、選ぶと useShellThemeStore.setShellTheme({ id, slug }) でシェル床を適用する
 * （「開いた瞬間に森」/ 2.1）。「なし」で setShellTheme(null) に戻す。フルギャラリー（検索/
 * プレビュー/お気に入り）は本スペック非スコープ。彩色は全てトークン＋プリミティブ（.shell-*）。
 */
export const ShellThemeSelector = () => {
	const { data: themes = [], isLoading } = useThemes();
	const selection = useShellThemeStore((s) => s.selection);
	const setShellTheme = useShellThemeStore((s) => s.setShellTheme);

	const systemThemes = themes.filter((theme) => theme.isSystem && getEffectKey(theme));

	return (
		<div data-testid="shell-theme-view" className="flex-1 overflow-y-auto">
			<div className="max-w-2xl mx-auto p-4">
				<h1 className="text-xl font-semibold text-[var(--on-surface)] mb-1">テーマ</h1>
				<p className="text-sm text-[var(--on-surface-variant)] mb-4">
					アプリ全体の世界観を選べるよ。選ぶと玄関から本文まで一貫して切り替わる。
				</p>
				{isLoading ? (
					<div className="text-[var(--on-surface-variant)]">読み込み中...</div>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
						<button
							type="button"
							onClick={() => setShellTheme(null)}
							aria-pressed={!selection}
							className={`shell-card cursor-pointer text-left ${
								!selection ? 'ring-2 ring-[var(--accent)]' : ''
							}`}
						>
							<div className="font-medium text-[var(--on-surface)]">なし（標準）</div>
							<div className="text-sm text-[var(--on-surface-variant)]">テーマを適用しない</div>
						</button>
						{systemThemes.map((theme) => {
							const slug = getEffectKey(theme);
							if (!slug) return null;
							const isSelected = selection?.id === theme.id;
							return (
								<button
									key={theme.id}
									type="button"
									onClick={() => setShellTheme({ id: theme.id, slug })}
									aria-pressed={isSelected}
									className={`shell-card cursor-pointer text-left ${
										isSelected ? 'ring-2 ring-[var(--accent)]' : ''
									}`}
								>
									<div className="font-medium text-[var(--on-surface)]">{theme.name}</div>
									{theme.description && (
										<div className="text-sm text-[var(--on-surface-variant)] line-clamp-2">
											{theme.description}
										</div>
									)}
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};
