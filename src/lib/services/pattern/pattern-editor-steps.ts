import {
	clampIntegerSetting,
	PATTERN_EDITOR_PAGE_STEP_DEFAULT,
	PATTERN_EDITOR_PAGE_STEP_MAX,
	PATTERN_EDITOR_PAGE_STEP_MIN,
	PATTERN_EDITOR_SCROLL_ROWS_DEFAULT,
	PATTERN_EDITOR_SCROLL_ROWS_MAX,
	PATTERN_EDITOR_SCROLL_ROWS_MIN
} from '../../config/settings';
import { settingsStore } from '../../stores/settings.svelte';

function pageStep(): number {
	return clampIntegerSetting(
		settingsStore.patternEditorPageStep,
		PATTERN_EDITOR_PAGE_STEP_MIN,
		PATTERN_EDITOR_PAGE_STEP_MAX,
		PATTERN_EDITOR_PAGE_STEP_DEFAULT
	);
}

function scrollRows(): number {
	return clampIntegerSetting(
		settingsStore.patternEditorScrollRows,
		PATTERN_EDITOR_SCROLL_ROWS_MIN,
		PATTERN_EDITOR_SCROLL_ROWS_MAX,
		PATTERN_EDITOR_SCROLL_ROWS_DEFAULT
	);
}

export function patternEditorPageDelta(direction: -1 | 1): number {
	return direction * pageStep();
}

export function patternEditorScrollDelta(deltaY: number): number {
	const direction = Math.sign(deltaY);
	if (direction === 0) return 0;
	return direction * scrollRows();
}
