import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternEditingService } from '../../../../src/lib/services/pattern/pattern-editing';
import type { EditingContext, FieldInfo } from '../../../../src/lib/services/pattern/editing/editing-context';
import type { Pattern } from '../../../../src/lib/models/song';
import { Pattern as PatternModel } from '../../../../src/lib/models/song';
import { PatternFieldDetection } from '../../../../src/lib/services/pattern/editing/pattern-field-detection';
import { PatternNoteInput } from '../../../../src/lib/services/pattern/editing/pattern-note-input';
import { PatternEnvelopeNoteInput } from '../../../../src/lib/services/pattern/editing/pattern-envelope-note-input';
import { PatternDeleteHandler } from '../../../../src/lib/services/pattern/editing/pattern-delete-handler';
import { editorStateStore } from '../../../../src/lib/stores/editor-state.svelte';

vi.mock('../../../../src/lib/stores/editor-state.svelte', () => ({
	editorStateStore: {
		envelopeAsNote: false
	}
}));

vi.mock('../../../../src/lib/services/pattern/editing/pattern-field-detection');
vi.mock('../../../../src/lib/services/pattern/editing/pattern-note-input');
vi.mock('../../../../src/lib/services/pattern/editing/pattern-envelope-note-input');
vi.mock('../../../../src/lib/services/pattern/editing/pattern-delete-handler');

describe('PatternEditingService', () => {
	const createMockContext = (overrides: Partial<EditingContext> = {}): EditingContext =>
		({
			pattern: new PatternModel(0, 64) as Pattern,
			selectedRow: 0,
			selectedColumn: 0,
			cellPositions: [],
			converter: {} as EditingContext['converter'],
			formatter: {} as EditingContext['formatter'],
			schema: {} as EditingContext['schema'],
			...overrides
		}) as EditingContext;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(editorStateStore).envelopeAsNote = false;
	});

	describe('handleMidiNote', () => {
		it('returns null when no field at cursor', () => {
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(null);
			const context = createMockContext();

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBeNull();
			expect(PatternNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});

		it('delegates to PatternNoteInput when field type is note', () => {
			const fieldInfo: FieldInfo = {
				fieldKey: 'note',
				fieldType: 'note',
				isGlobal: false,
				channelIndex: 0,
				charOffset: 0
			};
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(fieldInfo);
			const context = createMockContext();
			const expectedResult = {
				updatedPattern: new PatternModel(0, 64) as Pattern,
				shouldMoveNext: false
			};
			vi.mocked(PatternNoteInput.handleMidiNoteInput).mockReturnValue(expectedResult);

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBe(expectedResult);
			expect(PatternNoteInput.handleMidiNoteInput).toHaveBeenCalledWith(
				context,
				fieldInfo,
				60
			);
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});

		it('delegates to PatternEnvelopeNoteInput when field is envelopeValue with tuningTable and envelopeAsNote', () => {
			vi.mocked(editorStateStore).envelopeAsNote = true;
			const fieldInfo: FieldInfo = {
				fieldKey: 'envelopeValue',
				fieldType: 'hex',
				isGlobal: false,
				channelIndex: 0,
				charOffset: 0
			};
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(fieldInfo);
			const tuningTable = [1000, 900];
			const context = createMockContext({ tuningTable });
			const expectedResult = {
				updatedPattern: new PatternModel(0, 64) as Pattern,
				shouldMoveNext: false
			};
			vi.mocked(PatternEnvelopeNoteInput.handleMidiNoteInput).mockReturnValue(expectedResult);

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBe(expectedResult);
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).toHaveBeenCalledWith(
				context,
				fieldInfo,
				60
			);
			expect(PatternNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});

		it('returns null for envelopeValue when envelopeAsNote is false', () => {
			const fieldInfo: FieldInfo = {
				fieldKey: 'envelopeValue',
				fieldType: 'hex',
				isGlobal: false,
				channelIndex: 0,
				charOffset: 0
			};
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(fieldInfo);
			const context = createMockContext({ tuningTable: [1000] });

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBeNull();
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});

		it('returns null for envelopeValue when tuningTable is missing', () => {
			vi.mocked(editorStateStore).envelopeAsNote = true;
			const fieldInfo: FieldInfo = {
				fieldKey: 'envelopeValue',
				fieldType: 'hex',
				isGlobal: false,
				channelIndex: 0,
				charOffset: 0
			};
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(fieldInfo);
			const context = createMockContext();

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBeNull();
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});

		it('returns null for non-note non-envelope field', () => {
			const fieldInfo: FieldInfo = {
				fieldKey: 'instrument',
				fieldType: 'symbol',
				isGlobal: false,
				channelIndex: 0,
				charOffset: 0
			};
			vi.mocked(PatternFieldDetection.detectFieldAtCursor).mockReturnValue(fieldInfo);
			const context = createMockContext();

			const result = PatternEditingService.handleMidiNote(context, 60);

			expect(result).toBeNull();
			expect(PatternNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
			expect(PatternEnvelopeNoteInput.handleMidiNoteInput).not.toHaveBeenCalled();
		});
	});

	describe('handleKeyInput', () => {
		it('marks delete and backspace results as non-previewable', () => {
			const deleteHandlerResult = {
				updatedPattern: new PatternModel(0, 64) as Pattern,
				shouldMoveNext: false
			};
			vi.mocked(PatternDeleteHandler.handleDelete).mockReturnValue(deleteHandlerResult);
			const context = createMockContext();

			expect(PatternEditingService.handleKeyInput(context, 'Delete', 'Delete')).toEqual({
				...deleteHandlerResult,
				shouldPreview: false
			});
			expect(PatternEditingService.handleKeyInput(context, 'Backspace', 'Backspace')).toEqual({
				...deleteHandlerResult,
				shouldPreview: false
			});
		});

		it('returns null when delete handler makes no change', () => {
			vi.mocked(PatternDeleteHandler.handleDelete).mockReturnValue(null);
			const context = createMockContext();

			expect(PatternEditingService.handleKeyInput(context, 'Delete', 'Delete')).toBeNull();
		});
	});
});
