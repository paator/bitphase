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

function moduleBytes(expansion = 0, withArp = false): Uint8Array {
	const params = [
		expansion,
		...u32(5),
		...u32(0),
		...u32(0),
		...u32(0),
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
		0,
		0,
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
		: [
				...u32(1),
				...u32(0),
				...u32(0),
				3,
				...u32(-1),
				15,
				12,
				8,
				...u32(-1),
				...u32(0)
			];
	const frames = [...u32(2), ...u32(6), ...u32(150), ...u32(4), 0, 1, 0, 0, 0, 1, 1, 0, 0, 0];
	const patterns = [
		...u32(0),
		...u32(0),
		...u32(0),
		...u32(2),
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
		0,
		0
	];
	const later = [
		...u32(0),
		...u32(0),
		...u32(1),
		...u32(1),
		...u32(0),
		3,
		2,
		0,
		16,
		0,
		0,
		0,
		0
	];
	const noise = [
		...u32(0),
		...u32(3),
		...u32(0),
		...u32(1),
		...u32(0),
		0,
		0,
		64,
		16,
		18,
		1
	];
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
		expect(pulse[1]!.effects[0]).toBeNull();
		expect(song.patterns[1]!.channels[0]!.rows[0]!.note.name).toBe(NoteName.D);
		expect(song.patterns[1]!.channels[0]!.rows[0]!.note.octave).toBe(3);

		const noise = song.patterns[0]!.channels[3]!.rows[0]!;
		expect(noise.effects[0]).toMatchObject({ effect: EffectType.AutoEnvelope, delay: 1, parameter: 2 });

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

	it('warns when an expansion chip is present', () => {
		const { warnings } = importFtmBuffer(moduleBytes(1).buffer);
		expect(warnings.some((warning) => warning.includes('VRC6'))).toBe(true);
	});

	it('rejects a truncated module', () => {
		const bytes = moduleBytes();
		expect(() => importFtmBuffer(bytes.buffer.slice(0, 50))).toThrow();
	});
});
