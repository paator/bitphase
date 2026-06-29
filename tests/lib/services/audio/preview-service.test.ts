import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewService } from '../../../../src/lib/services/audio/preview-service';
import { Pattern as PatternModel, Note, NoteName } from '../../../../src/lib/models/song';
import type { Pattern } from '../../../../src/lib/models/song';
import type { PreviewNoteSupport } from '../../../../src/lib/chips/base/processor';
import { AY_CHIP_SCHEMA } from '../../../../src/lib/chips/ay/schema';
import { AYConverter } from '../../../../src/lib/chips/ay/adapter';

describe('PreviewService', () => {
	const previewService = new PreviewService();
	const converter = new AYConverter();
	const schema = AY_CHIP_SCHEMA;

	function createPatternWithNotes(): Pattern {
		const pattern = new PatternModel(0, 4, schema) as Pattern;
		pattern.channels[0].rows[0].note = new Note(NoteName.C, 4);
		pattern.channels[1].rows[0].note = new Note(NoteName.E, 4);
		pattern.channels[2].rows[0].note = new Note(NoteName.G, 4);
		return pattern;
	}

	let processor: PreviewNoteSupport;

	beforeEach(() => {
		processor = {
			playPreviewRow: vi.fn(),
			stopPreviewNote: vi.fn()
		};
	});

	it('previews the full row when previewFullRow is enabled', () => {
		const pattern = createPatternWithNotes();

		const result = previewService.playFromContext(
			processor,
			pattern,
			1,
			0,
			schema,
			converter,
			{ previewFullRow: true }
		);

		expect(result).toBe(-1);
		expect(processor.playPreviewRow).toHaveBeenCalledWith(pattern, 0, undefined, undefined);
	});

	it('previews only the edited channel when previewFullRow is disabled', () => {
		const pattern = createPatternWithNotes();

		const result = previewService.playFromContext(
			processor,
			pattern,
			1,
			0,
			schema,
			converter,
			{ previewFullRow: false }
		);

		expect(result).toBe(1);
		expect(processor.playPreviewRow).toHaveBeenCalledTimes(1);
		const [previewPattern, rowIndex, , channelIndex] = vi.mocked(processor.playPreviewRow).mock
			.calls[0];
		expect(rowIndex).toBe(0);
		expect(channelIndex).toBe(1);
		expect(previewPattern.channels[1].rows[0].note.name).toBe(NoteName.E);
		expect(previewPattern.channels[0].rows[0].note.name).toBe(NoteName.None);
		expect(previewPattern.channels[2].rows[0].note.name).toBe(NoteName.None);
	});

	it('previews the full row for global fields even when previewFullRow is disabled', () => {
		const pattern = createPatternWithNotes();

		const result = previewService.playFromContext(
			processor,
			pattern,
			0,
			0,
			schema,
			converter,
			{ previewFullRow: false, isGlobalField: true }
		);

		expect(result).toBe(-1);
		expect(processor.playPreviewRow).toHaveBeenCalledWith(pattern, 0, undefined, undefined);
	});
});
