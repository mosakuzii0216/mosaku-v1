# Research & Design Decisions

---

## Summary

- **Feature**: `auto-save`
- **Discovery Scope**: Extension（既存コンポーネントへの機能追加）
- **Key Findings**:
  - `MemoEditor` の `handleSave` と `hasChanges` は既に整備されており、デバウンスフックの統合が容易
  - `useCreateMemo` 成功後にビュー遷移を行わないため、create モードでの自動保存後は `useMemoDataStore.setSelectedMemoId` + `useViewStore.setCurrentView` で edit モードへ遷移させる必要がある
  - 新規ライブラリ追加不要。`useRef` + `setTimeout` の標準 API で実装可能

---

## Research Log

### MemoEditor の現状分析

- **Context**: 既存の保存ロジックとの統合ポイントを把握するための調査
- **Sources Consulted**: `frontend/src/components/memo/MemoEditor.tsx`
- **Findings**:
  - `handleSave` が `useCallback` で定義済み（create / edit 両モード対応）
  - `hasChanges` boolean で変更有無を管理
  - `createMemo.isPending || updateMemo.isPending` で保存中状態を判定可能
  - Cmd+S ショートカットで `handleSave` を呼ぶ既存実装あり
  - 保存後の UI フィードバックは「未保存の変更があります」テキストのみ（4状態表示なし）
- **Implications**: `useAutoSave` フックに `scheduleAutoSave()` と `cancelDebounce()` を持たせ、MemoEditor の各フィールド onChange と手動保存に接続する設計が最適

### create モード自動保存後のビュー遷移

- **Context**: `isCreate=true` で自動保存が成功した場合、次の自動保存が重複作成しないか検証
- **Findings**:
  - `useCreateMemo.onSuccess` は `queryClient.invalidateQueries` のみ実行、ビュー遷移なし
  - auto-save が二重に発火すると同一内容のメモが複数作成される
  - `useMemoDataStore.setSelectedMemoId(result.id)` + `useViewStore.setCurrentView('edit')` で edit モードへ遷移させれば以降は updateMemo を使用する
- **Implications**: `handleSave` の create 成功時に上記遷移ロジックを追加する必要がある

### デバウンス実装方式

- **Context**: 外部ライブラリ（lodash.debounce 等）vs ネイティブ API の選択
- **Sources Consulted**: React 公式ドキュメント（useRef + setTimeout パターン）
- **Findings**:
  - lodash.debounce は新規依存を追加するが機能的に同等
  - `useRef<ReturnType<typeof setTimeout>>` + `clearTimeout` で十分実装可能
  - アンマウント時の cleanup が `useEffect` return で確実に行える
- **Implications**: 外部依存なし。ネイティブ API を採用

---

## Architecture Pattern Evaluation

| Option                         | Description                                    | Strengths                        | Risks / Limitations                           |
| ------------------------------ | ---------------------------------------------- | -------------------------------- | --------------------------------------------- |
| インライン useEffect           | MemoEditor 内にデバウンス useEffect を直接追加 | シンプル、ファイル数増加なし     | MemoEditor がさらに肥大化（audit B-2 と逆行） |
| **カスタムフック useAutoSave** | デバウンスと状態管理を独立フックに抽出         | テスタブル・再利用可能・関心分離 | ファイル追加が必要                            |

→ **カスタムフック採用**（既存フック群 `useThemeCSS`, `useAppInit` と同パターン）

---

## Design Decisions

### Decision: `SaveStatus` の4状態モデル

- **Context**: 保存状態 UI に何を表示するか
- **Alternatives Considered**:
  1. boolean `isSaving` のみ — シンプルだが成功/エラーを区別できない
  2. 4状態 union type — idle / pending / saving / saved / error
- **Selected Approach**: `'idle' | 'pending' | 'saving' | 'saved' | 'error'` の5状態 union
- **Rationale**: 要件 2.1〜2.4 の各状態を型で表現でき、UI テキストとの対応が明確
- **Trade-offs**: `boolean` より複雑になるが、状態遷移が明示的で実装ミスを防ぐ

### Decision: `saved` 状態の自動リセット

- **Context**: 保存成功後、インジケーターをいつ消すか
- **Selected Approach**: `saved` → 2秒後に `idle` へ自動遷移（setTimeout）
- **Rationale**: ユーザーが「保存された」と認識できる最低限の表示時間を確保しつつ、常時表示による UI ノイズを回避

### Decision: create モード自動保存後の edit モード遷移

- **Context**: 重複メモ作成防止
- **Selected Approach**: `handleSave` の create 成功コールバックで `setSelectedMemoId(result.id)` + `setCurrentView('edit')` を呼び出す
- **Rationale**: 以降の自動保存が updateMemo を使用するよう切り替わる。ビュー遷移ロジックは useViewStore / useMemoDataStore が担うため MemoEditor 側は軽微な変更で済む

---

## Risks & Mitigations

- **デバウンス中のメモ切り替え**: 別のメモを選択した際にタイマーが残ると前のメモが保存される → `memo` prop 変更時に `cancelDebounce()` を呼び出す（`useEffect([memo])` で cleanup）
- **保存中の重複リクエスト**: `isSaving=true` 中はタイマー発火時にスキップ（要件 4.3）
- **ネットワークエラー**: `error` 状態をインジケーターに表示し手動保存を促す（要件 2.4）
