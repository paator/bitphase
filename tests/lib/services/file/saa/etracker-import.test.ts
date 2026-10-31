import { describe, expect, it } from 'vitest';
import { EffectType, NoteName } from '@/lib/models/song';
import { importEtrackerBuffer, isEtrackerBuffer } from '@/lib/services/file/saa/etracker-import';

const SIGNATURE = 'ETracker (C) BY ESI.';

function compiledModule(): ArrayBuffer {
	const bytes = new Uint8Array(64);
	const view = new DataView(bytes.buffer);
	const write = (offset: number, value: number) => view.setUint16(offset, value, true);
	write(0, 49);
	write(2, 51);
	write(4, 44);
	write(6, 46);
	write(8, 48);
	for (let index = 0; index < SIGNATURE.length; index++) {
		bytes[10 + index] = SIGNATURE.charCodeAt(index);
	}
	bytes.set([0xb1, 0x10, 0xff, 0xfc], 30);
	bytes.set([3, 0xff], 34);
	bytes.set([5, 34, 21, 82, 114, 0xd2, 0x51], 36);
	bytes[43] = 0x51;
	write(44, 30);
	write(46, 34);
	bytes[48] = 0;
	bytes.set([0, 0xff], 49);
	write(51, 36);
	write(53, 43);
	write(55, 43);
	write(57, 43);
	write(59, 43);
	write(61, 43);
	return bytes.buffer;
}

describe('E-Tracker import', () => {
	it('turns a compiled sample shift and noise clock into tone and noise offsets', () => {
		const buffer = compiledModule();
		expect(isEtrackerBuffer(buffer)).toBe(true);
		const { project } = importEtrackerBuffer(buffer, 'demo.cop');
		expect(project.name).toBe('demo.cop');
		expect(project.initialSpeed).toBe(6);
		expect(project.songs[0]?.chipType).toBe('saa');
		expect(project.songs[0]?.a4TuningHz).toBe(415);
		expect(project.songs[0]?.tuningTable[0]).toBe(0x05);
		expect(project.songs[0]?.tuningTable[45]).toBe(0x03d2);
		const instrument = project.instruments[0];
		expect(instrument?.macros?.tone?.values).toEqual([true, false]);
		expect(instrument?.macros?.toneAdd?.values).toEqual([-16, 0]);
		expect(instrument?.macros?.toneAccumulation?.values).toEqual([false, false]);
		expect(instrument?.macros?.noise?.values).toEqual([true, false]);
		expect(instrument?.macros?.noiseAdd?.values).toEqual([2, 0]);
		expect(instrument?.macros?.noiseAccumulation?.values).toEqual([false, false]);
		expect(project.tables[0]?.id).toBe(0);
		expect(project.tables[0]?.rows).toEqual([3, 0]);
		const row = project.songs[0]?.patterns[0]?.channels[0]?.rows[0];
		expect(row?.note?.name).toBe(NoteName.C);
		expect(row?.note?.octave).toBe(1);
		expect(row?.instrument).toBe(1);
		expect(project.songs[0]?.patterns[0]?.patternRows[0]?.env0).toBe(1);
		expect(row?.left).toBe(11);
		expect(row?.right).toBe(11);
		expect(row?.effects?.filter((effect) => effect).map((effect) => [effect.effect, effect.delay, effect.parameter])).toEqual([
			[EffectType.Speed, 0, 6]
		]);
		expect(instrument?.macros?.envelope).toBeUndefined();
	});

	it('turns wrapped ornament steps into downward semitone offsets', () => {
		const bytes = new Uint8Array(compiledModule());
		const extended = new Uint8Array(bytes.length + 5);
		extended.set(bytes);
		const dataAt = bytes.length;
		extended.set([0x00, 0x5f, 0x5f, 0x5e, 0xff], dataAt);
		new DataView(extended.buffer).setUint16(46, dataAt, true);
		const { project } = importEtrackerBuffer(extended.buffer, 'descent.cop');
		expect(project.tables[0]?.rows).toEqual([0, -1, -1, -2, 0]);
	});
});
