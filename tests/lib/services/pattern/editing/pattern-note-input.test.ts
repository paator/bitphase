import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternNoteInput } from '../../../../../src/lib/services/pattern/editing/pattern-note-input';
import { Pattern, Note, NoteName } from '../../../../../src/lib/models/song';
import type {
	EditingContext,
	FieldInfo
} from '../../../../../src/lib/services/pattern/editing/editing-context';
import { PatternValueUpdates } from '../../../../../src/lib/services/pattern/editing/pattern-value-updates';
import { parseNoteFromString, formatNoteFromEnum } from '../../../../../src/lib/utils/note-utils';

vi.mock('../../../../../src/lib/stores/editor-state.svelte', () => ({
	editorStateStore: {
		octave: 3,
		step: 1,
		envelopeAsNote: false,
		currentInstrument: '01'
	}
}));

vi.mock('../../../../../src/lib/services/pattern/editing/pattern-value-updates');
vi.mock('../../../../../src/lib/utils/note-utils', async () => {
	const actual = await vi.importActual<typeof import('../../../../../src/lib/utils/note-utils')>(
		'../../../../../src/lib/utils/note-utils'
	);
	return {
		...actual,
		formatNoteFromEnum: vi.fn((name: NoteName, octave: number) => {
			const notes = [
				'---',
				'OFF',
				'C-',
				'C#',
				'D-',
				'D#',
				'E-',
				'F-',
				'F#',
				'G-',
				'G#',
				'A-',
				'A#',
				'B-'
			];
			if (name === NoteName.None) return '---';
			if (name === NoteName.Off) return 'OFF';
			return notes[name] + octave;
		}),
		parseNoteFromString: vi.fn((str: string) => {
			if (str === '---') return { noteName: NoteName.None, octave: 0 };
			if (str === 'OFF') return { noteName: NoteName.Off, octave: 0 };
			const match = str.match(/^([A-G]#?)-(\d)$/);
			if (match) {
				const noteMap: Record<string, NoteName> = {
					'C-': NoteName.C,
					'C#': NoteName.CSharp,
					'D-': NoteName.D,
					'D#': NoteName.DSharp,
					'E-': NoteName.E,
					'F-': NoteName.F,
					'F#': NoteName.FSharp,
					'G-': NoteName.G,
					'G#': NoteName.GSharp,
					'A-': NoteName.A,
					'A#': NoteName.ASharp,
					'B-': NoteName.B
				};
				return {
					noteName: noteMap[match[1] + '-'] || NoteName.None,
					octave: parseInt(match[2], 10)
				};
			}
			return { noteName: NoteName.None, octave: 0 };
		})
	};
});

const DEFAULT_PATTERN_ID = 0;
const DEFAULT_PATTERN_LENGTH = 64;
const DEFAULT_ROW_INDEX = 0;
const DEFAULT_CHANNEL_INDEX = 0;
const FIXED_OCTAVE = 4;

describe('PatternNoteInput', () => {
	let mockUpdateFieldValue: ReturnType<typeof vi.fn>;
	let mockGetFieldValue: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockUpdateFieldValue = vi.fn(
			(context: EditingContext, fieldInfo: FieldInfo, value: string | number) => {
				const updatedPattern = new Pattern(context.pattern.id, context.pattern.length);
				const row =
					updatedPattern.channels[fieldInfo.channelIndex].rows[context.selectedRow];

				if (value === 'OFF') {
					row.note = new Note(NoteName.Off, 0);
				} else if (value && typeof value === 'string' && value !== '---') {
					const match = value.match(/^([A-G]#?)-(\d)$/);
					if (match) {
						const noteMap: Record<string, NoteName> = {
							'C-': NoteName.C,
							'C#': NoteName.CSharp,
							'D-': NoteName.D,
							'D#': NoteName.DSharp,
							'E-': NoteName.E,
							'F-': NoteName.F,
							'F#': NoteName.FSharp,
							'G-': NoteName.G,
							'G#': NoteName.GSharp,
							'A-': NoteName.A,
							'A#': NoteName.ASharp,
							'B-': NoteName.B
						};
						row.note = new Note(
							noteMap[match[1] + '-'] || NoteName.None,
							parseInt(match[2], 10)
						);
					}
				}
				return updatedPattern;
			}
		);

		mockGetFieldValue = vi
			.fn((context: EditingContext, fieldInfo: FieldInfo) => {
				const row =
					context.pattern.channels[fieldInfo.channelIndex].rows[context.selectedRow];
				if (row.note.name === NoteName.None) return '---';
				if (row.note.name === NoteName.Off) return 'OFF';
				const noteNames = [
					'',
					'',
					'C-',
					'C#',
					'D-',
					'D#',
					'E-',
					'F-',
					'F#',
					'G-',
					'G#',
					'A-',
					'A#',
					'B-'
				];
				return noteNames[row.note.name] + row.note.octave;
			})
			.mockImplementation((context: EditingContext, fieldInfo: FieldInfo) => {
				const row =
					context.pattern.channels[fieldInfo.channelIndex].rows[context.selectedRow];
				if (row.note.name === NoteName.None) return '---';
				if (row.note.name === NoteName.Off) return 'OFF';
				const noteNames = [
					'',
					'',
					'C-',
					'C#',
					'D-',
					'D#',
					'E-',
					'F-',
					'F#',
					'G-',
					'G#',
					'A-',
					'A#',
					'B-'
				];
				return noteNames[row.note.name] + row.note.octave;
			});

		vi.mocked(PatternValueUpdates.updateFieldValue).mockImplementation(
			mockUpdateFieldValue as (
				context: EditingContext,
				fieldInfo: FieldInfo,
				newValue: string | number
			) => Pattern
		);
		vi.mocked(PatternValueUpdates.getFieldValue).mockImplementation(
			mockGetFieldValue as (context: EditingContext, fieldInfo: FieldInfo) => string | number
		);
	});

	const createMockContext = (
		pattern: Pattern,
		selectedRow: number = DEFAULT_ROW_INDEX
	): EditingContext => {
		return {
			pattern,
			selectedRow,
			selectedColumn: 0,
			cellPositions: [],
			converter: {} as EditingContext['converter'],
			formatter: {} as EditingContext['formatter'],
			schema: {} as EditingContext['schema']
		};
	};

	const createFieldInfo = (channelIndex: number): FieldInfo => {
		return {
			channelIndex,
			fieldKey: 'note',
			fieldType: 'string',
			isGlobal: false,
			charOffset: 0
		};
	};

	describe('handleNoteInput', () => {
		describe('validation', () => {
			it('should return null when field is global', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo: FieldInfo = {
					...createFieldInfo(DEFAULT_CHANNEL_INDEX),
					isGlobal: true
				};

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q');

				expect(result).toBeNull();
			});

			it('should return null when channel index is invalid', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(-1);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q');

				expect(result).toBeNull();
			});
		});

		describe('OFF note input', () => {
			it('should set note to OFF when A key is pressed', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'a');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'OFF');
			});
		});

		describe('piano keyboard input', () => {
			it('should map Q key to C-4', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q');

				expect(result).not.toBeNull();
				expect(result?.shouldMoveNext).toBe(false);
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'C-4');
			});

			it('should map lowercase c key to E-3', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'c');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'E-3');
			});

			it('should handle multiple piano keys correctly', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const testCases = [
					{ key: 'w', expectedNote: 'D-4' },
					{ key: 'e', expectedNote: 'E-4' },
					{ key: 'r', expectedNote: 'F-4' },
					{ key: 't', expectedNote: 'G-4' },
					{ key: 'y', expectedNote: 'A-4' },
					{ key: 'u', expectedNote: 'B-4' }
				];

				testCases.forEach(({ key, expectedNote }) => {
					mockUpdateFieldValue.mockClear();
					const result = PatternNoteInput.handleNoteInput(context, fieldInfo, key);

					expect(result).not.toBeNull();
					expect(mockUpdateFieldValue).toHaveBeenCalledWith(
						context,
						fieldInfo,
						expectedNote
					);
				});
			});
		});

		describe('letter note input', () => {
			it('should handle uppercase letter note input', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'C');

				expect(result).not.toBeNull();
				expect(result?.shouldMoveNext).toBe(false);
			});
		});
	});

	describe('handleMidiNoteInput', () => {
		it('should return null when field is global', () => {
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
			const context = createMockContext(pattern);
			const fieldInfo: FieldInfo = {
				...createFieldInfo(DEFAULT_CHANNEL_INDEX),
				isGlobal: true
			};

			const result = PatternNoteInput.handleMidiNoteInput(context, fieldInfo, 60);

			expect(result).toBeNull();
		});

		it('should return null when channel index is invalid', () => {
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
			const context = createMockContext(pattern);
			const fieldInfo = createFieldInfo(-1);

			const result = PatternNoteInput.handleMidiNoteInput(context, fieldInfo, 60);

			expect(result).toBeNull();
		});

		it('should return null for invalid midi note', () => {
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
			const context = createMockContext(pattern);
			const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

			expect(PatternNoteInput.handleMidiNoteInput(context, fieldInfo, -1)).toBeNull();
			expect(PatternNoteInput.handleMidiNoteInput(context, fieldInfo, 128)).toBeNull();
		});

		it('should map MIDI 60 to C-4 and call updateFieldValue', () => {
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
			const context = createMockContext(pattern);
			const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

			const result = PatternNoteInput.handleMidiNoteInput(context, fieldInfo, 60);

			expect(result).not.toBeNull();
			expect(result?.shouldMoveNext).toBe(false);
			expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'C-4');
		});

		it('should map MIDI 69 to A-4', () => {
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
			const context = createMockContext(pattern);
			const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

			const result = PatternNoteInput.handleMidiNoteInput(context, fieldInfo, 69);

			expect(result).not.toBeNull();
			expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'A-4');
		});
	});
});
