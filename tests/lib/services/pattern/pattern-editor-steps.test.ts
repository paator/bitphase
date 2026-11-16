import { afterEach, describe, expect, it } from 'vitest';
import {
	patternEditorPageDelta,
	patternEditorScrollDelta
} from '../../../../src/lib/services/pattern/pattern-editor-steps';
import { settingsStore } from '../../../../src/lib/stores/settings.svelte';

describe('pattern editor steps', () => {
	const pageStep = settingsStore.patternEditorPageStep;
	const scrollRows = settingsStore.patternEditorScrollRows;

	afterEach(() => {
		settingsStore.patternEditorPageStep = pageStep;
		settingsStore.patternEditorScrollRows = scrollRows;
	});

	it('uses one wheel row and a 16-row page by default', () => {
		expect(patternEditorPageDelta(1)).toBe(16);
		expect(patternEditorPageDelta(-1)).toBe(-16);
		expect(patternEditorScrollDelta(120)).toBe(1);
		expect(patternEditorScrollDelta(-4)).toBe(-1);
		expect(patternEditorScrollDelta(0)).toBe(0);
	});

	it('follows configured page and wheel steps', () => {
		settingsStore.patternEditorPageStep = 8;
		settingsStore.patternEditorScrollRows = 3;

		expect(patternEditorPageDelta(-1)).toBe(-8);
		expect(patternEditorScrollDelta(1)).toBe(3);
		expect(patternEditorScrollDelta(-50)).toBe(-3);
	});

	it('keeps steps inside their allowed range', () => {
		settingsStore.patternEditorPageStep = 0;
		settingsStore.patternEditorScrollRows = 500;

		expect(patternEditorPageDelta(1)).toBe(1);
		expect(patternEditorScrollDelta(10)).toBe(64);
	});
});
