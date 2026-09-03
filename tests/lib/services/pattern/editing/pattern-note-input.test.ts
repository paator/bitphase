import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternNoteInput } from '../../../../../src/lib/services/pattern/editing/pattern-note-input';
import { Pattern, Note, NoteName, Instrument } from '../../../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../../../src/lib/chips/ay/schema';
import type {
	EditingContext,
	FieldInfo
} from '../../../../../src/lib/services/pattern/editing/editing-context';
import { PatternValueUpdates } from '../../../../../src/lib/services/pattern/editing/pattern-value-updates';
import { parseNoteFromString, formatNoteFromEnum } from '../../../../../src/lib/utils/note-utils';
import { editorStateStore } from '../../../../../src/lib/stores/editor-state.svelte';
import { settingsStore } from '../../../../../src/lib/stores/settings.svelte';

vi.mock('../../../../../src/lib/stores/editor-state.svelte', () => ({
	editorStateStore: {
		octave: 3,
		step: 1,
		envelopeAsNote: false,
		currentInstrument: '01',
		getCurrentInstrument: vi.fn(() => '01')
	}
}));

vi.mock('../../../../../src/lib/stores/settings.svelte', () => ({
	settingsStore: {
		autoEnterInstrument: false
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
		settingsStore.autoEnterInstrument = false;
		vi.mocked(editorStateStore.getCurrentInstrument).mockReturnValue('01');

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
				newValue: string | number | Record<string, unknown> | null
			) => Pattern
		);
		vi.mocked(PatternValueUpdates.getFieldValue).mockImplementation(
			mockGetFieldValue as (context: EditingContext, fieldInfo: FieldInfo) => string | number
		);
	});

	const createMockContext = (
		pattern: Pattern,
		selectedRow: number = DEFAULT_ROW_INDEX,
		overrides: Partial<EditingContext> = {}
	): EditingContext => {
		return {
			pattern,
			selectedRow,
			selectedColumn: 0,
			cellPositions: [],
			converter: {} as EditingContext['converter'],
			formatter: {} as EditingContext['formatter'],
			schema: {} as EditingContext['schema'],
			...overrides
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

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).toBeNull();
			});

			it('should return null when channel index is invalid', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(-1);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).toBeNull();
			});
		});

		describe('OFF note input', () => {
			it('should set note to OFF when A key is pressed', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'a', 'KeyA');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'OFF');
			});
		});

		describe('piano keyboard input', () => {
			it('should map KeyQ to C-4', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).not.toBeNull();
				expect(result?.shouldMoveNext).toBe(false);
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'C-4');
			});

			it('should return a non-mutating result when mapped note matches the current note', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				pattern.channels[DEFAULT_CHANNEL_INDEX].rows[DEFAULT_ROW_INDEX].note = new Note(
					NoteName.C,
					FIXED_OCTAVE
				);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).toEqual({
					updatedPattern: pattern,
					shouldMoveNext: false,
					didChange: false
				});
				expect(mockUpdateFieldValue).not.toHaveBeenCalled();
			});

			it('should map KeyC to E-3', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'c', 'KeyC');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'E-3');
			});

			it('should use physical key location regardless of typed character (Colemak layout)', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'w', 'KeyQ');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'C-4');
			});

			it('should handle multiple piano keys correctly', () => {
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern);
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const testCases = [
					{ key: 'w', code: 'KeyW', expectedNote: 'D-4' },
					{ key: 'e', code: 'KeyE', expectedNote: 'E-4' },
					{ key: 'r', code: 'KeyR', expectedNote: 'F-4' },
					{ key: 't', code: 'KeyT', expectedNote: 'G-4' },
					{ key: 'y', code: 'KeyY', expectedNote: 'A-4' },
					{ key: 'u', code: 'KeyU', expectedNote: 'B-4' }
				];

				testCases.forEach(({ key, code, expectedNote }) => {
					mockUpdateFieldValue.mockClear();
					const result = PatternNoteInput.handleNoteInput(context, fieldInfo, key, code);

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

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'F', 'KeyF');

				expect(result).not.toBeNull();
				expect(result?.shouldMoveNext).toBe(false);
			});
		});

		describe('auto-enter instrument', () => {
			it('writes the selected instrument when it exists for the active chip', () => {
				settingsStore.autoEnterInstrument = true;
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern, DEFAULT_ROW_INDEX, {
					schema: AY_CHIP_SCHEMA,
					instruments: [new Instrument('01', 'AY 01', 'ay')]
				});
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledTimes(2);
				expect(mockUpdateFieldValue.mock.calls[1][1]).toEqual(
					expect.objectContaining({ fieldKey: 'instrument' })
				);
				expect(mockUpdateFieldValue.mock.calls[1][2]).toBe(1);
			});

			it('overwrites the instrument when re-entering the same note', () => {
				settingsStore.autoEnterInstrument = true;
				vi.mocked(editorStateStore.getCurrentInstrument).mockReturnValue('02');
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				pattern.channels[DEFAULT_CHANNEL_INDEX].rows[DEFAULT_ROW_INDEX].note = new Note(
					NoteName.C,
					FIXED_OCTAVE
				);
				pattern.channels[DEFAULT_CHANNEL_INDEX].rows[DEFAULT_ROW_INDEX].instrument = 1;
				const context = createMockContext(pattern, DEFAULT_ROW_INDEX, {
					schema: AY_CHIP_SCHEMA,
					instruments: [
						new Instrument('01', 'AY 01', 'ay'),
						new Instrument('02', 'AY 02', 'ay')
					]
				});
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				mockGetFieldValue.mockImplementation(
					(ctx: EditingContext, info: FieldInfo) => {
						if (info.fieldKey === 'instrument') {
							return ctx.pattern.channels[info.channelIndex].rows[ctx.selectedRow]
								.instrument;
						}
						const row =
							ctx.pattern.channels[info.channelIndex].rows[ctx.selectedRow];
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
					}
				);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).not.toBeNull();
				expect(result?.didChange).not.toBe(false);
				expect(mockUpdateFieldValue).toHaveBeenCalledTimes(1);
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(
					expect.objectContaining({ pattern }),
					expect.objectContaining({ fieldKey: 'instrument' }),
					2
				);
			});

			it('does not mutate when the same note and instrument are already present', () => {
				settingsStore.autoEnterInstrument = true;
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				pattern.channels[DEFAULT_CHANNEL_INDEX].rows[DEFAULT_ROW_INDEX].note = new Note(
					NoteName.C,
					FIXED_OCTAVE
				);
				pattern.channels[DEFAULT_CHANNEL_INDEX].rows[DEFAULT_ROW_INDEX].instrument = 1;
				const context = createMockContext(pattern, DEFAULT_ROW_INDEX, {
					schema: AY_CHIP_SCHEMA,
					instruments: [new Instrument('01', 'AY 01', 'ay')]
				});
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				mockGetFieldValue.mockImplementation(
					(ctx: EditingContext, info: FieldInfo) => {
						if (info.fieldKey === 'instrument') {
							return ctx.pattern.channels[info.channelIndex].rows[ctx.selectedRow]
								.instrument;
						}
						const row =
							ctx.pattern.channels[info.channelIndex].rows[ctx.selectedRow];
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
					}
				);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).toEqual({
					updatedPattern: pattern,
					shouldMoveNext: false,
					didChange: false
				});
				expect(mockUpdateFieldValue).not.toHaveBeenCalled();
			});

			it('skips stale selected instruments that are missing from the active chip list', () => {
				settingsStore.autoEnterInstrument = true;
				const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH);
				const context = createMockContext(pattern, DEFAULT_ROW_INDEX, {
					schema: AY_CHIP_SCHEMA,
					instruments: [new Instrument('02', 'AY 02', 'ay')]
				});
				const fieldInfo = createFieldInfo(DEFAULT_CHANNEL_INDEX);

				const result = PatternNoteInput.handleNoteInput(context, fieldInfo, 'q', 'KeyQ');

				expect(result).not.toBeNull();
				expect(mockUpdateFieldValue).toHaveBeenCalledTimes(1);
				expect(mockUpdateFieldValue).toHaveBeenCalledWith(context, fieldInfo, 'C-4');
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
