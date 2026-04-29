export {
	createScrubber,
	DEFAULT_PLACEHOLDER,
	DEFAULT_REDACTABLE_KEYS,
	DEFAULT_VALUE_PATTERNS,
	type ScrubberOptions,
	type SentryScrubber,
} from './sentry-scrubber';
export {
	applyStandardTags,
	resolveFeatureArea,
	type FeatureArea,
	type StandardTags,
	type TaggedEvent,
} from './sentry-tags';
export { SENTRY_ENV_KEYS, type SentryEnvKey } from './sentry-env-keys';
export { SentryUserContextInterceptor } from './sentry-user-context.interceptor';
