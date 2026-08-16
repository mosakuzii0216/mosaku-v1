import { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useEditorFocusStore } from '../stores/useEditorFocusStore';

const IDLE_TIMEOUT_MS = 3000;

export interface MoriEffectControlState {
	shouldRun: boolean;
	isReducedMotion: boolean;
	isEditorFocused: boolean;
	isHidden: boolean;
	isIdle: boolean;
}

export function useMoriEffectControl(): MoriEffectControlState {
	const isReducedMotion = useReducedMotion();
	const isEditorFocused = useEditorFocusStore((s) => s.isEditorFocused);

	const [isHidden, setIsHidden] = useState(() => document.visibilityState === 'hidden');
	const [isIdle, setIsIdle] = useState(false);

	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isIdleRef = useRef(false);

	const resetIdleTimer = useCallback(() => {
		if (isIdleRef.current) {
			isIdleRef.current = false;
			setIsIdle(false);
		}
		if (idleTimerRef.current !== null) {
			clearTimeout(idleTimerRef.current);
		}
		idleTimerRef.current = setTimeout(() => {
			isIdleRef.current = true;
			setIsIdle(true);
		}, IDLE_TIMEOUT_MS);
	}, []);

	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsHidden(document.visibilityState === 'hidden');
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, []);

	useEffect(() => {
		const handleMouseMove = () => {
			resetIdleTimer();
		};

		idleTimerRef.current = setTimeout(() => {
			isIdleRef.current = true;
			setIsIdle(true);
		}, IDLE_TIMEOUT_MS);

		document.addEventListener('mousemove', handleMouseMove);
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			if (idleTimerRef.current !== null) {
				clearTimeout(idleTimerRef.current);
			}
		};
	}, [resetIdleTimer]);

	const shouldRun = !isReducedMotion && !isEditorFocused && !isHidden && !isIdle;

	return { shouldRun, isReducedMotion, isEditorFocused, isHidden, isIdle };
}
