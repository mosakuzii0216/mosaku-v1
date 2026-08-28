/**
 * ゴミ箱に入れたメモが物理削除されるまでの保持日数。
 *
 * backend の `src/memo/trash-cleanup.service.ts` の TRASH_RETENTION_DAYS と同じ値を保つこと。
 * パッケージを跨ぐため型では縛れず、片方だけ変更しても何も落ちない。ズレると本画面の
 * 「自動削除まで N 日」と実際に消えるタイミングが食い違う。
 */
export const TRASH_RETENTION_DAYS = 30;
