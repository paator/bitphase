import { describe, it, expect } from 'vitest';
import type { SharedTimelineExportSlot } from '../../../../src/lib/chips/base/renderer';
import { isMixedChipSharedTimelineExport } from '../../../../src/lib/services/file/mixed-chip-shared-timeline-export';
import { AYUMI_AUDIO_SLOT_KIND } from '../../../../src/lib/chips/ay/audio-slot-kind';
import { NES_AUDIO_SLOT_KIND } from '../../../../src/lib/chips/nes/audio-slot-kind';

describe('mixed chip shared timeline export', () => {
	it('detects mixed audio slot kinds', () => {
		const slots: SharedTimelineExportSlot[] = [
			{ songIndex: 0, audioSlotKind: AYUMI_AUDIO_SLOT_KIND },
			{ songIndex: 1, audioSlotKind: NES_AUDIO_SLOT_KIND }
		];
		expect(isMixedChipSharedTimelineExport(slots)).toBe(true);
	});

	it('returns false for homogeneous slots', () => {
		const slots: SharedTimelineExportSlot[] = [
			{ songIndex: 0, audioSlotKind: AYUMI_AUDIO_SLOT_KIND },
			{ songIndex: 1, audioSlotKind: AYUMI_AUDIO_SLOT_KIND }
		];
		expect(isMixedChipSharedTimelineExport(slots)).toBe(false);
	});

	it('returns false for a single slot', () => {
		const slots: SharedTimelineExportSlot[] = [
			{ songIndex: 0, audioSlotKind: AYUMI_AUDIO_SLOT_KIND }
		];
		expect(isMixedChipSharedTimelineExport(slots)).toBe(false);
	});
});
