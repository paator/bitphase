import { describe, expect, it } from 'vitest';
import { EffectType, NoteName } from '@/lib/models/song';
import { importFtmBuffer, isFtmBuffer } from '@/lib/services/file/nes/ftm-import';

function u32(value: number): number[] {
	return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255];
}

function ascii(text: string): number[] {
	return [...text].map((char) => char.charCodeAt(0));
}

function padded(text: string, length: number): number[] {
	const out = ascii(text);
	while (out.length < length) out.push(0);
	return out.slice(0, length);
}

function block(name: string, version: number, data: number[]): number[] {
	return [...padded(name, 16), ...u32(version), ...u32(data.length), ...data];
}

function moduleBytes(
	expansion = 0,
	withArp = false,
	pitchAbsolute = false,
	noteCuts = false
): Uint8Array {
	const params = [
		expansion,
		...u32(5),
		...u32(0),
		...u32(0),
		...u32(1),
		...u32(4),
		...u32(16),
		...u32(32)
	];
	const info = [...padded('Demo', 32), ...padded('Ada', 32), ...padded('', 32)];
	const header = [0, ...ascii('Song'), 0];
	for (let channel = 0; channel < 5; channel++) {
		header.push(channel, channel === 0 ? 1 : 0);
	}
	const keys: number[] = [];
	for (let key = 0; key < 96; key++) {
		if (key === 0) keys.push(1, 0x8f, 0xff);
		else keys.push(0, 0, 0xff);
	}
	const instruments = [
		...u32(1),
		...u32(0),
		1,
		...u32(5),
		1,
		0,
		withArp ? 1 : 0,
		withArp ? 1 : 0,
		pitchAbsolute ? 1 : 0,
		pitchAbsolute ? 1 : 0,
		0,
		0,
		0,
		0,
		...keys,
		...u32(4),
		...ascii('Lead')
	];
	const sequences = withArp
		? [
				...u32(2),
				...u32(0),
				...u32(0),
				3,
				...u32(-1),
				15,
				12,
				8,
				...u32(1),
				...u32(1),
				2,
				...u32(0),
				4,
				7,
				...u32(-1),
				...u32(0),
				...u32(-1),
				...u32(0)
			]
		: pitchAbsolute
			? [
					...u32(2),
					...u32(0),
					...u32(0),
					3,
					...u32(-1),
					15,
					12,
					8,
					...u32(1),
					...u32(2),
					3,
					...u32(-1),
					4,
					0,
					-4,
					...u32(-1),
					...u32(0),
					...u32(-1),
					...u32(1)
				]
			: [...u32(1), ...u32(0), ...u32(0), 3, ...u32(-1), 15, 12, 8, ...u32(-1), ...u32(0)];
	const frames = [...u32(2), ...u32(6), ...u32(150), ...u32(4), 0, 1, 0, 0, 0, 1, 1, 0, 0, 0];
	const patterns = [
		...u32(0),
		...u32(0),
		...u32(0),
		...u32(4),
		...u32(0),
		1,
		0,
		0,
		15,
		10,
		0x37,
		1,
		6,
		...u32(1),
		14,
		0,
		64,
		16,
		14,
		1,
		4,
		0xab,
		...u32(2),
		0,
		0,
		64,
		16,
		22,
		0x13,
		11,
		0x18,
		...u32(3),
		0,
		0,
		64,
		16,
		22,
		0x01,
		11,
		0x46
	];
	const later = [
		...u32(0),
		...u32(0),
		...u32(1),
		...u32(noteCuts ? 4 : 2),
		...u32(0),
		3,
		2,
		0,
		16,
		6,
		0,
		6,
		0x12,
		...u32(1),
		0,
		0,
		64,
		16,
		6,
		0,
		0,
		0,
		...(noteCuts
			? [...u32(2), 1, 0, 64, 16, 23, 0x06, 23, 0x10, ...u32(3), 1, 0, 64, 16, 23, 0x00, 0, 0]
			: [])
	];
	const noise = [...u32(0), ...u32(3), ...u32(0), ...u32(1), ...u32(0), 0, 0, 64, 16, 18, 1];
	const samples = [1, 0, ...u32(4), ...ascii('Kick'), ...u32(4), 0xff, 0xff, 0xff, 0xff];
	return Uint8Array.from([
		...ascii('FamiTracker Module'),
		...u32(0x0440),
		...block('PARAMS', 6, params),
		...block('INFO', 1, info),
		...block('HEADER', 3, header),
		...block('INSTRUMENTS', 6, instruments),
		...block('SEQUENCES', 6, sequences),
		...block('FRAMES', 3, frames),
		...block('PATTERNS', 5, [...patterns, ...later, ...noise]),
		...block('DPCM SAMPLES', 1, samples),
		...block('GROOVES', 1, [0]),
		...block('END', 0, [])
	]);
}

function tinySong(
	rows: number[][],
	length = rows.length,
	channel = 0,
	extraBlocks: number[] = [],
	fileHeader = 'FamiTracker Module'
): Uint8Array {
	const params = [
		0,
		...u32(5),
		...u32(0),
		...u32(0),
		...u32(1),
		...u32(4),
		...u32(16),
		...u32(32)
	];
	const info = [...padded('Carry', 32), ...padded('', 32), ...padded('', 32)];
	const header = [0, ...ascii('Song'), 0];
	for (let channel = 0; channel < 5; channel++) header.push(channel, 0);
	const frames = [...u32(1), ...u32(6), ...u32(150), ...u32(length), 0, 0, 0, 0, 0];
	const patterns = [...u32(0), ...u32(channel), ...u32(0), ...u32(rows.length), ...rows.flat()];
	return Uint8Array.from([
		...ascii(fileHeader),
		...u32(0x0440),
		...block('PARAMS', 6, params),
		...block('INFO', 1, info),
		...block('HEADER', 3, header),
		...block('INSTRUMENTS', 6, u32(0)),
		...block('FRAMES', 3, frames),
		...block('PATTERNS', 5, patterns),
		...extraBlocks,
		...block('END', 0, [])
	]);
}

function patternCell(
	row: number,
	note: number,
	octave: number,
	effect: number,
	param: number
): number[] {
	return [...u32(row), note, octave, 64, 16, effect, param];
}

describe('ftm import', () => {
	it('recognizes a FamiTracker module', () => {
		expect(isFtmBuffer(moduleBytes().buffer)).toBe(true);
		expect(isFtmBuffer(new ArrayBuffer(8))).toBe(false);
	});

	it('imports a 2A03 module into a NES song', () => {
		const { project, warnings } = importFtmBuffer(moduleBytes().buffer, 'fallback');
		expect(project.name).toBe('Demo');
		expect(project.author).toBe('Ada');
		expect(project.patternOrder).toEqual([0, 1]);
		expect(warnings.some((warning) => warning.includes('G'))).toBe(true);
		expect(warnings.some((warning) => warning.includes('GROOVES'))).toBe(true);

		const song = project.songs[0]!;
		expect(song.chipType).toBe('nes');
		expect(song.chipVariant).toBe('NTSC');
		expect(song.initialSpeed).toBe(6);
		expect(song.interruptFrequency).toBe(60);
		expect(song.tempo).toBe(150);
		expect(warnings.some((warning) => warning.includes('tempo was not imported'))).toBe(false);
		expect(song.patterns[0]!.length).toBe(4);

		const pulse = song.patterns[0]!.channels[0]!.rows;
		expect(pulse[0]!.note.name).toBe(NoteName.C);
		expect(pulse[0]!.note.octave).toBe(1);
		expect(pulse[0]!.instrument).toBe(1);
		expect(pulse[0]!.volume).toBe(15);
		expect(pulse[0]!.effects[0]).toMatchObject({
			effect: EffectType.Arpeggio,
			delay: 0,
			parameter: 0x37
		});
		expect(pulse[0]!.effects[1]).toMatchObject({
			effect: EffectType.Speed,
			parameter: 6
		});
		expect(pulse[1]!.note.name).toBe(NoteName.Off);
		expect(pulse[1]!.instrument).toBe(0);
		expect(pulse[1]!.effects[0]).toMatchObject({
			effect: EffectType.SongEnd,
			delay: 0,
			parameter: 0
		});
		expect(
			warnings.some((warning) => warning.includes('Skipped') && /\bC\b/.test(warning))
		).toBe(false);
		expect(pulse[2]!.note.name).toBe(NoteName.None);
		expect(pulse[2]!.effects[0]).toMatchObject({
			effect: EffectType.VolumeSlide,
			delay: 4,
			parameter: 0x01
		});
		expect(pulse[2]!.effects[1]).toMatchObject({
			effect: EffectType.Vibrato,
			delay: 2,
			parameter: 0x8d
		});
		expect(pulse[3]!.effects[0]).toMatchObject({
			effect: EffectType.VolumeSlide,
			delay: 8,
			parameter: 0x01
		});
		expect(pulse[3]!.effects[1]).toMatchObject({
			effect: EffectType.Vibrato,
			delay: 1,
			parameter: 0x49
		});
		const porta = song.patterns[1]!.channels[0]!.rows;
		expect(porta[0]!.note.name).toBe(NoteName.D);
		expect(porta[0]!.note.octave).toBe(3);
		expect(porta[0]!.effects[0]).toMatchObject({
			effect: EffectType.Portamento,
			delay: 0,
			parameter: 0x12
		});
		expect(porta[0]!.effects.some((effect) => effect?.effect === EffectType.Vibrato)).toBe(
			true
		);
		expect(porta[1]!.note.name).toBe(NoteName.None);
		expect(porta[1]!.effects[0]).toMatchObject({
			effect: EffectType.Portamento,
			delay: 0,
			parameter: 0
		});
		expect(
			warnings.some((warning) => warning.includes('Skipped') && /\b3\b/.test(warning))
		).toBe(false);

		const noise = song.patterns[0]!.channels[3]!.rows[0]!;
		expect(noise.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 1,
			parameter: 2
		});

		const instrument = project.instruments[0]!;
		expect(instrument.name).toBe('Lead');
		expect(instrument.chipType).toBe('nes');
		expect(instrument.macros?.volumeOrRate).toEqual({ values: [15, 12, 8], loop: 2 });
		const samples = instrument.dpcmSamples as { name: string; data: number[] }[];
		expect(samples).toHaveLength(1);
		expect(samples[0]!.name).toBe('Kick');
		expect(samples[0]!.data).toHaveLength(17);
		expect(instrument.dpcmAssignments?.[0]).toEqual({
			sampleIndex: 0,
			pitch: 15,
			loop: true,
			delta: null
		});
	});

	it('imports instrument arpeggios as pattern tables', () => {
		const { project, warnings } = importFtmBuffer(moduleBytes(0, true).buffer);
		expect(warnings.some((warning) => warning.includes('arpeggio'))).toBe(false);
		expect(project.tables[0]).toMatchObject({
			id: 0,
			rows: [4, 7],
			loop: 0,
			additive: false
		});
		expect(project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!.table).toBe(1);
	});

	it('keeps an absolute pitch sequence from accumulating', () => {
		const { project } = importFtmBuffer(moduleBytes(0, false, true).buffer);
		expect(project.instruments[0]!.macros?.toneAdd).toEqual({ values: [4, 0, -4], loop: 2 });
		expect(project.instruments[0]!.macros?.toneAccumulation).toEqual({
			values: [false, false, false],
			loop: 2
		});
	});

	it('maps delayed note cuts onto the on/off command', () => {
		const { project, warnings } = importFtmBuffer(moduleBytes(0, false, false, true).buffer);
		const rows = project.songs[0]!.patterns[1]!.channels[0]!.rows;
		expect(rows[2]!.note.name).toBe(NoteName.C);
		expect(rows[2]!.note.octave).toBe(1);
		expect(rows[2]!.effects[0]).toMatchObject({
			effect: EffectType.OnOff,
			delay: 0,
			parameter: 0x60
		});
		expect(rows[2]!.effects[1]).toMatchObject({ effect: EffectType.Vibrato });
		expect(rows[3]!.note.name).toBe(NoteName.Off);
		expect(rows[3]!.effects[0]).toBeNull();
		expect(
			warnings.some((warning) => warning.includes('Skipped') && /\bS\b/.test(warning))
		).toBe(true);
	});

	it('copies pitch slides onto later notes and leaves hardware sweep on its row', () => {
		const { project } = importFtmBuffer(
			tinySong([
				patternCell(0, 1, 3, 9, 0x12),
				patternCell(1, 5, 3, 0, 0),
				patternCell(2, 8, 3, 17, 0x20),
				patternCell(3, 10, 3, 0, 0)
			]).buffer
		);
		const rows = project.songs[0]!.patterns[0]!.channels[0]!.rows;
		expect(rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 3,
			parameter: 0x12
		});
		expect(rows[1]!.effects[0]).toBeNull();
		expect(rows[2]!.effects[0]).toMatchObject({
			effect: EffectType.SlideUp,
			delay: 1,
			parameter: 0x20
		});
		expect(rows[3]!.effects[0]).toMatchObject({
			effect: EffectType.SlideUp,
			delay: 1,
			parameter: 0x20
		});
	});

	it('repeats slides, vibrato, and arpeggio on later notes', () => {
		const { project } = importFtmBuffer(
			tinySong([
				patternCell(0, 1, 3, 16, 0x20),
				patternCell(1, 5, 3, 0, 0),
				patternCell(2, 8, 3, 16, 0),
				patternCell(3, 10, 3, 0, 0)
			]).buffer
		);
		const rows = project.songs[0]!.patterns[0]!.channels[0]!.rows;
		expect(rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.SlideDown,
			delay: 1,
			parameter: 0x20
		});
		expect(rows[1]!.effects[0]).toMatchObject({
			effect: EffectType.SlideDown,
			delay: 1,
			parameter: 0x20
		});
		expect(rows[2]!.effects[0]).toMatchObject({
			effect: EffectType.SlideDown,
			delay: 1,
			parameter: 0
		});
		expect(rows[3]!.effects[0]).toBeNull();
	});

	it('keeps portamento across notes and retriggers it after a cut', () => {
		const { project } = importFtmBuffer(
			tinySong([
				patternCell(0, 1, 3, 6, 0x10),
				patternCell(1, 5, 3, 0, 0),
				patternCell(2, 14, 0, 0, 0),
				patternCell(3, 8, 3, 0, 0),
				patternCell(4, 10, 3, 0, 0)
			]).buffer
		);
		const rows = project.songs[0]!.patterns[0]!.channels[0]!.rows;
		expect(rows[1]!.effects[0]).toMatchObject({
			effect: EffectType.Portamento,
			parameter: 0x10
		});
		expect(rows[3]!.effects[0]).toBeNull();
		expect(rows[4]!.effects[0]).toMatchObject({
			effect: EffectType.Portamento,
			parameter: 0x10
		});
	});

	it('leaves a volume slide on later notes and restores it after a cut', () => {
		const { project } = importFtmBuffer(
			tinySong([
				patternCell(0, 1, 3, 22, 0x01),
				patternCell(1, 5, 3, 0, 0),
				patternCell(2, 14, 0, 0, 0),
				patternCell(3, 8, 3, 0, 0)
			]).buffer
		);
		const rows = project.songs[0]!.patterns[0]!.channels[0]!.rows;
		expect(rows[1]!.effects[0]).toBeNull();
		expect(rows[3]!.effects[0]).toMatchObject({ effect: EffectType.VolumeSlide });
	});

	it('ends a pattern on the first B or D row', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong(
				[
					patternCell(0, 1, 3, 0, 0),
					patternCell(1, 5, 3, 3, 0x10),
					patternCell(3, 8, 3, 2, 0x02)
				],
				6
			).buffer
		);
		const pattern = project.songs[0]!.patterns[0]!;
		expect(pattern.length).toBe(2);
		expect(pattern.channels[0]!.rows).toHaveLength(2);
		expect(pattern.channels[0]!.rows[1]!.note.name).toBe(NoteName.E);
		expect(
			warnings.some((warning) => warning.includes('Skipped') && /\b[BD]\b/.test(warning))
		).toBe(false);
	});

	it('warns when an expansion chip is present', () => {
		const { warnings } = importFtmBuffer(moduleBytes(1).buffer);
		expect(warnings.some((warning) => warning.includes('VRC6'))).toBe(true);
	});

	it('rejects a truncated module', () => {
		const bytes = moduleBytes();
		expect(() => importFtmBuffer(bytes.buffer.slice(0, 50))).toThrow();
	});
});

function dnmBytes(expansion = 0x20, fileHeader = 'Dn-FamiTracker Module'): Uint8Array {
	const channels = expansion === 0x20 ? 8 : 5;
	const params = [
		expansion,
		...u32(channels),
		...u32(0),
		...u32(0),
		...u32(0),
		...u32(0),
		...u32(0),
		...u32(32)
	];
	const info = [...padded('Gimmick', 32), ...padded('Sunsoft', 32), ...padded('', 32)];
	const header = [0, ...ascii('Song'), 0];
	for (let channel = 0; channel < channels; channel++) {
		header.push(channel, 0);
	}
	const s5bInstrument = [
		...u32(1),
		...u32(0),
		6,
		...u32(5),
		1,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		1,
		...u32(4),
		...ascii('Bass')
	];
	const sequences = [
		...u32(2),
		...u32(0),
		...u32(0),
		2,
		...u32(-1),
		...u32(-1),
		...u32(0),
		15,
		8,
		...u32(1),
		...u32(4),
		1,
		...u32(-1),
		...u32(-1),
		...u32(0),
		0xc3
	];
	const frames = [...u32(1), ...u32(6), ...u32(150), ...u32(1), ...Array(channels).fill(0)];
	const nesNote = [...u32(0), ...u32(0), ...u32(0), ...u32(1), ...u32(0), 1, 3, 0, 15, 0, 0];
	const ayNote = [...u32(0), ...u32(5), ...u32(0), ...u32(1), ...u32(0), 1, 3, 0, 12, 0, 0];
	return Uint8Array.from([
		...ascii(fileHeader),
		...u32(0x0450),
		...block('PARAMS', 6, params),
		...block('INFO', 1, info),
		...block('HEADER', 3, header),
		...block('INSTRUMENTS', 6, s5bInstrument),
		...block('SEQUENCES_S5B', 1, sequences),
		...block('FRAMES', 3, frames),
		...block('PATTERNS', 5, [...nesNote, ...ayNote]),
		...block('END', 0, [])
	]);
}

describe('dnm import', () => {
	it('recognizes a Dn-FamiTracker module', () => {
		expect(isFtmBuffer(dnmBytes().buffer)).toBe(true);
	});

	it('imports NES + 5B as NES and AY at the Sunsoft clock', () => {
		const { project } = importFtmBuffer(dnmBytes().buffer, 'fallback');
		expect(project.name).toBe('Gimmick');
		expect(project.songs).toHaveLength(2);

		const nes = project.songs[0]!;
		const ay = project.songs[1]!;
		expect(nes.chipType).toBe('nes');
		expect(nes.patterns[0]!.channels[0]!.rows[0]!.note).toMatchObject({
			name: NoteName.C,
			octave: 4
		});

		expect(ay.chipType).toBe('ay');
		expect(ay.chipVariant).toBe('YM');
		expect(ay.chipFrequency).toBe(894886);
		expect(ay.tuningTableIndex).toBe(5);
		expect(ay.tuningTable[45]).toBe(Math.round(894886 / 16 / 440));
		expect(ay.initialSpeed).toBe(6);
		expect(ay.tempo).toBe(150);
		expect(ay.interruptFrequency).toBe(60);
		const ayRow = ay.patterns[0]!.channels[0]!.rows[0]!;
		expect(ayRow.note).toMatchObject({ name: NoteName.C, octave: 3 });
		expect(ayRow.volume).toBe(12);
		expect(ayRow.instrument).toBe(1);

		const instrument = project.instruments[0]!;
		expect(instrument.chipType).toBe('ay');
		expect(instrument.name).toBe('Bass');
		expect(instrument.macros?.volume).toEqual({ values: [15, 8], loop: 1 });
		expect(instrument.macros?.tone).toEqual({ values: [true], loop: 0 });
		expect(instrument.macros?.noise).toEqual({ values: [true], loop: 0 });
		expect(instrument.macros?.envelope).toEqual({ values: [false], loop: 0 });
		expect(instrument.macros?.noiseAdd).toEqual({ values: [3], loop: 0 });
	});

	it('imports a FamiTracker-header NES + 5B module as NES and AY', () => {
		const { project, warnings } = importFtmBuffer(
			dnmBytes(0x20, 'FamiTracker Module').buffer,
			'fallback'
		);
		expect(project.songs).toHaveLength(2);
		expect(project.songs[0]!.chipType).toBe('nes');
		expect(project.songs[1]!.chipType).toBe('ay');
		expect(warnings.some((warning) => warning.includes('skipped'))).toBe(false);
	});

	it('imports 0CC effects from a Dn module that has none of the 0CC blocks', () => {
		const header = 'Dn-FamiTracker Module';
		const length = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 5, 0x1f)], 1, 0, [], header).buffer
		);
		expect(length.project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!.volume).toBe(0);
		expect(length.project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 5,
			parameter: 0x1f
		});

		const envelope = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 5, 0xe1)], 1, 0, [], header).buffer
		);
		expect(envelope.project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!.effects[0]).toMatchObject(
			{
				effect: EffectType.ChipSpecific,
				delay: 6,
				parameter: 2
			}
		);

		const linear = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 23, 0xc0)], 1, 2, [], header).buffer
		);
		expect(linear.project.songs[0]!.patterns[0]!.channels[2]!.rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 8,
			parameter: 0x40
		});
	});

	it('imports a plain NES Dn-FamiTracker module', () => {
		const { project } = importFtmBuffer(dnmBytes(0).buffer, 'fallback');
		expect(project.songs).toHaveLength(1);
		expect(project.songs[0]!.chipType).toBe('nes');
	});

	it('rejects a Dn-FamiTracker module with an unsupported expansion', () => {
		expect(() => importFtmBuffer(dnmBytes(1).buffer)).toThrow(/NES and NES \+ 5B/);
	});

	it('imports vanilla Wxx and 0CC Wxx as E7XY', () => {
		const vanilla = importFtmBuffer(tinySong([patternCell(0, 0, 0, 26, 0x1a)], 1, 4).buffer);
		expect(vanilla.project.songs[0]!.patterns[0]!.channels[4]!.rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 7,
			parameter: 0x0a
		});
		const zeroCc = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 29, 0x03)], 1, 4, block('GROOVES', 1, [0])).buffer
		);
		expect(zeroCc.project.songs[0]!.patterns[0]!.channels[4]!.rows[0]!.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 7,
			parameter: 0x03
		});
		expect(zeroCc.warnings.some((warning) => warning.includes('W'))).toBe(false);
	});

	it('imports Zxx as E4XY on the DPCM channel', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 15, 0xff)], 1, 4).buffer
		);
		const row = project.songs[0]!.patterns[0]!.channels[4]!.rows[0]!;
		expect(row.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 4,
			parameter: 0x7f
		});
		expect(warnings.some((warning) => warning.includes('Z'))).toBe(false);
	});

	it('skips Zxx on pulse channels', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 15, 0x40)]).buffer
		);
		expect(project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!.effects[0]).toBeNull();
		expect(warnings.some((warning) => /\bZ\b/.test(warning))).toBe(true);
	});

	it('keeps vanilla Exx as a volume command', () => {
		const { project } = importFtmBuffer(tinySong([patternCell(0, 0, 0, 5, 0x03)]).buffer);
		const row = project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!;
		expect(row.volume).toBe(3);
		expect(row.effects[0]).toBeNull();
	});

	it('imports 0CC Exx as E5XY', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 5, 0x1f)], 1, 0, block('GROOVES', 1, [0])).buffer
		);
		const row = project.songs[0]!.patterns[0]!.channels[0]!.rows[0]!;
		expect(row.volume).toBe(0);
		expect(row.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 5,
			parameter: 0x1f
		});
		expect(warnings.some((warning) => warning.includes('EE'))).toBe(false);
	});

	it('imports 0CC EEx as E6XY', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 5, 0xe1)], 1, 2, block('PARAMS_EXTRA', 2, [0])).buffer
		);
		const row = project.songs[0]!.patterns[0]!.channels[2]!.rows[0]!;
		expect(row.volume).toBe(0);
		expect(row.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 6,
			parameter: 2
		});
		expect(warnings.some((warning) => warning.includes('EE'))).toBe(false);
	});

	it('imports 0CC triangle S80-SFF as E8XY', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 23, 0xc0)], 1, 2, block('GROOVES', 1, [0])).buffer
		);
		const row = project.songs[0]!.patterns[0]!.channels[2]!.rows[0]!;
		expect(row.effects[0]).toMatchObject({
			effect: EffectType.ChipSpecific,
			delay: 8,
			parameter: 0x40
		});
		expect(warnings.some((warning) => /\bS\b/.test(warning))).toBe(false);
	});

	it('skips vanilla Sxx above 0F', () => {
		const { project, warnings } = importFtmBuffer(
			tinySong([patternCell(0, 0, 0, 23, 0xc0)], 1, 2).buffer
		);
		expect(project.songs[0]!.patterns[0]!.channels[2]!.rows[0]!.effects[0]).toBeNull();
		expect(warnings.some((warning) => warning.includes('S'))).toBe(true);
	});
});
