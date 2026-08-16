export interface BroadcastChannelLike {
	postMessage(data: unknown): void;
	close(): void;
	onmessage: ((event: { data: unknown }) => void) | null;
}

export interface LeaderElectionOptions {
	channelName?: string;
	channelFactory?: (name: string) => BroadcastChannelLike | null;
	tabId?: string;
	claimTimeoutMs?: number;
}

export interface LeaderElection {
	start(): Promise<void>;
	stop(): void;
	isLeader(): boolean;
}

type LeaderMessage = { type: 'claim'; tabId: string } | { type: 'leader-announce'; tabId: string };

const DEFAULT_CHANNEL_NAME = 'mosaku-sync';
const DEFAULT_CLAIM_TIMEOUT_MS = 200;

function defaultChannelFactory(name: string): BroadcastChannelLike | null {
	if (typeof BroadcastChannel === 'undefined') return null;
	return new BroadcastChannel(name) as unknown as BroadcastChannelLike;
}

function generateTabId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLeaderMessage(value: unknown): value is LeaderMessage {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<LeaderMessage>;
	if (candidate.type !== 'claim' && candidate.type !== 'leader-announce') return false;
	return typeof candidate.tabId === 'string';
}

export function createLeaderElection(options: LeaderElectionOptions = {}): LeaderElection {
	const channelName = options.channelName ?? DEFAULT_CHANNEL_NAME;
	const channelFactory = options.channelFactory ?? defaultChannelFactory;
	const tabId = options.tabId ?? generateTabId();
	const claimTimeoutMs = options.claimTimeoutMs ?? DEFAULT_CLAIM_TIMEOUT_MS;

	let channel: BroadcastChannelLike | null = null;
	let leader = false;
	let started = false;
	let claimTimer: ReturnType<typeof setTimeout> | null = null;
	let resolveStart: (() => void) | null = null;

	const finalize = (asLeader: boolean) => {
		leader = asLeader;
		if (claimTimer !== null) {
			clearTimeout(claimTimer);
			claimTimer = null;
		}
		if (asLeader && channel) {
			channel.postMessage({ type: 'leader-announce', tabId } satisfies LeaderMessage);
		}
		if (resolveStart) {
			resolveStart();
			resolveStart = null;
		}
	};

	const handleMessage = (event: { data: unknown }) => {
		const data = event.data;
		if (!isLeaderMessage(data)) return;
		if (data.tabId === tabId) return;
		if (data.type === 'leader-announce') {
			finalize(false);
			return;
		}
		if (data.type === 'claim' && leader && channel) {
			channel.postMessage({ type: 'leader-announce', tabId } satisfies LeaderMessage);
		}
	};

	return {
		async start(): Promise<void> {
			if (started) return;
			started = true;

			channel = channelFactory(channelName);
			if (!channel) {
				leader = true;
				return;
			}

			channel.onmessage = handleMessage;
			channel.postMessage({ type: 'claim', tabId } satisfies LeaderMessage);

			await new Promise<void>((resolve) => {
				resolveStart = resolve;
				claimTimer = setTimeout(() => {
					finalize(true);
				}, claimTimeoutMs);
			});
		},
		stop() {
			started = false;
			leader = false;
			if (claimTimer !== null) {
				clearTimeout(claimTimer);
				claimTimer = null;
			}
			if (channel) {
				channel.onmessage = null;
				channel.close();
				channel = null;
			}
			if (resolveStart) {
				resolveStart();
				resolveStart = null;
			}
		},
		isLeader() {
			return leader;
		},
	};
}
