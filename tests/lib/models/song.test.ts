import { describe, it, expect } from 'vitest';
import {
	Song,
	Pattern,
	Note,
	NoteName,
	Effect,
	EffectType,
	Instrument,
	InstrumentRow
} from '../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../src/lib/chips/ay/schema';

describe('Song', () => {
	describe('constructor', () => {
		it('should create a song with default values', () => {
			const song = new Song(AY_CHIP_SCHEMA);

			expect(song.initialSpeed).toBe(3);
			expect(song.defaultPatternLength).toBe(64);
			expect(song.patterns).toHaveLength(1);
			expect(song.patterns[0].id).toBe(0);
			expect(song.tuningTable).toEqual([]);
			expect(song.chipVariant).toBeUndefined();
			expect(song.interruptFrequency).toBe(50);
		});
	});

	describe('addPattern', () => {
		it('should add a new pattern with sequential ID', () => {
			const song = new Song(AY_CHIP_SCHEMA);

			const pattern1 = song.addPattern();
			const pattern2 = song.addPattern();

			expect(pattern1.id).toBe(1);
			expect(pattern2.id).toBe(2);
			expect(song.patterns).toHaveLength(3);
		});

		it('should create pattern with default length', () => {
			const song = new Song(AY_CHIP_SCHEMA);
			const pattern = song.addPattern();

			expect(pattern.length).toBe(64);
			expect(pattern.channels).toHaveLength(3);
		});

		it('should create pattern with song defaultPatternLength', () => {
			const song = new Song(AY_CHIP_SCHEMA);
			song.defaultPatternLength = 32;
			const pattern = song.addPattern();

			expect(pattern.length).toBe(32);
		});
	});
});

describe('Pattern', () => {
	describe('constructor', () => {
		it('should create pattern with default length', () => {
			const pattern = new Pattern(5);

			expect(pattern.id).toBe(5);
			expect(pattern.length).toBe(64);
			expect(pattern.channels).toHaveLength(3);
			expect(pattern.patternRows).toHaveLength(64);
		});

		it('should create pattern with custom length', () => {
			const pattern = new Pattern(10, 32);

			expect(pattern.id).toBe(10);
			expect(pattern.length).toBe(32);
			expect(pattern.channels).toHaveLength(3);
			expect(pattern.patternRows).toHaveLength(32);
		});

		it('should initialize channels with correct labels', () => {
			const pattern = new Pattern(0);

			expect(pattern.channels[0].label).toBe('A');
			expect(pattern.channels[1].label).toBe('B');
			expect(pattern.channels[2].label).toBe('C');
		});

		it('should initialize empty rows', () => {
			const pattern = new Pattern(0, 4, AY_CHIP_SCHEMA);

			expect(pattern.channels[0].rows).toHaveLength(4);
			expect(pattern.channels[0].rows[0].note.name).toBe(NoteName.None);
			expect(pattern.channels[0].rows[0].instrument).toBe(0);
			expect(pattern.channels[0].rows[0].volume).toBe(0);
		});
	});
});

describe('Note', () => {
	describe('constructor', () => {
		it('should create note with default values', () => {
			const note = new Note();

			expect(note.name).toBe(NoteName.None);
			expect(note.octave).toBe(0);
		});

		it('should create note with specified values', () => {
			const note = new Note(NoteName.C, 4);

			expect(note.name).toBe(NoteName.C);
			expect(note.octave).toBe(4);
		});
	});
});

describe('Effect', () => {
	describe('constructor', () => {
		it('should create effect with default values', () => {
			const effect = new Effect(EffectType.Arpeggio);

			expect(effect.effect).toBe(EffectType.Arpeggio);
			expect(effect.delay).toBe(0);
			expect(effect.parameter).toBe(0);
		});

		it('should create effect with specified values', () => {
			const effect = new Effect(EffectType.Vibrato, 2, 15);

			expect(effect.effect).toBe(EffectType.Vibrato);
			expect(effect.delay).toBe(2);
			expect(effect.parameter).toBe(15);
		});
	});
});

describe('Instrument', () => {
	describe('constructor', () => {
		it('should create instrument with specified values', () => {
			const instrument = new Instrument('05', 'Lead', 'ay');

			expect(instrument.id).toBe('05');
			expect(instrument.name).toBe('Lead');
			expect(instrument.chipType).toBe('ay');
			expect(instrument.macros).toBeUndefined();
		});

		it('should create instrument with default name and chip', () => {
			const instrument = new Instrument('01');

			expect(instrument.name).toBe('Instrument 01');
			expect(instrument.chipType).toBe('ay');
		});
	});
});

describe('InstrumentRow', () => {
	describe('constructor', () => {
		it('should create instrument row with all properties', () => {
			const row = new InstrumentRow({
				tone: true,
				noise: false,
				envelope: true,
				toneAdd: 5,
				noiseAdd: 3,
				volume: 12,
				loop: false,
				amplitudeSliding: true,
				amplitudeSlideUp: false,
				toneAccumulation: true,
				noiseAccumulation: false
			});

			expect(row.tone).toBe(true);
			expect(row.noise).toBe(false);
			expect(row.envelope).toBe(true);
			expect(row.toneAdd).toBe(5);
			expect(row.noiseAdd).toBe(3);
			expect(row.volume).toBe(12);
			expect(row.loop).toBe(false);
			expect(row.amplitudeSliding).toBe(true);
			expect(row.amplitudeSlideUp).toBe(false);
			expect(row.toneAccumulation).toBe(true);
			expect(row.noiseAccumulation).toBe(false);
		});
	});
});
