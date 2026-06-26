import { describe, expect, it } from 'vitest';
import { readTaym, writeTaym } from '@/lib/services/file/taym/codec';
import {
	makeActn,
	makeChip,
	makeLane,
	makeMods,
	makeTaym,
	makeTimr,
	makeTlan,
	makeTrak,
	type Taym
} from '@/lib/services/file/taym/model';
import * as spec from '@/lib/services/file/taym/spec';
import { check, validate } from '@/lib/services/file/taym/validate';

// Generated once from the Python reference:
//   python -m taym sample   (build() == write_taym(build_model()))
// Pins byte-for-byte compatibility with the spec's canonical witness.
const PYTHON_WITNESS = new Uint8Array([
	84, 65, 89, 77, 1, 0, 16, 0, 0, 0, 0, 0, 214, 0, 0, 0, 84, 82, 65, 75, 16, 0, 0, 0, 0, 0, 50, 0, 2,
	0, 0, 0, 255, 255, 255, 255, 1, 1, 0, 0, 67, 72, 73, 80, 32, 0, 0, 0, 88, 15, 27, 0, 1, 0, 0, 0,
	65, 89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 73, 77, 82, 6, 0, 0,
	0, 16, 0, 0, 1, 0, 0, 77, 79, 68, 83, 32, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 65, 67, 84, 78, 6, 0, 0, 0, 0, 0, 0, 0, 8, 1,
	76, 65, 78, 69, 16, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 84, 76, 65, 78, 16,
	0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 86, 85, 48, 56, 2, 0, 0, 0, 15, 0, 86,
	85, 49, 54, 0, 0, 0, 0, 86, 85, 51, 50, 8, 0, 0, 0, 25, 0, 0, 0, 75, 0, 0, 0
]);

function buildCanonicalSample(): Taym {
	return makeTaym(makeTrak(50.0, 2, spec.NO_LOOP), {
		chips: [makeChip(1773400, { chipTypeId: spec.CHIP_TYPE_AY, name: 'AY' })],
		timers: [makeTimr(0, spec.CLOCK_CHIP_PERIOD, 16)],
		mods: [
			makeMods(spec.CMD_START, {
				baseTimerValue: 25,
				timerLaneRef: 0,
				firstAction: 0,
				actionCount: 1
			}),
			makeMods(spec.CMD_STOP)
		],
		actions: [makeActn(0x08, spec.SRC_BIND_LANE, 0)],
		lanes: [makeLane(spec.VT_U8, 0, 2, 0)],
		tlanes: [makeTlan(spec.TM_ABSOLUTE, 0, 2, 0)],
		vu08: [15, 0],
		vu32: [25, 75]
	});
}

describe('taym codec', () => {
	it('writes the canonical sample byte-for-byte like the Python witness', () => {
		const bytes = new Uint8Array(writeTaym(buildCanonicalSample()));
		expect(Array.from(bytes)).toEqual(Array.from(PYTHON_WITNESS));
	});

	it('round-trips writeTaym(readTaym(x)) === x', () => {
		const original = new Uint8Array(writeTaym(buildCanonicalSample()));
		const reparsed = new Uint8Array(writeTaym(readTaym(original)));
		expect(Array.from(reparsed)).toEqual(Array.from(original));
	});

	it('parses the canonical sample into the expected model', () => {
		const model = readTaym(PYTHON_WITNESS);
		expect(model.trak.frameRateHz).toBe(50);
		expect(model.trak.frameCount).toBe(2);
		expect(model.trak.loopFrame).toBe(spec.NO_LOOP);
		expect(model.chips).toHaveLength(1);
		expect(model.chips[0].clockHz).toBe(1773400);
		expect(model.chips[0].name).toBe('AY');
		expect(model.timers[0].clockDivider).toBe(16);
		expect(model.mods[0].command).toBe(spec.CMD_START);
		expect(model.mods[1].command).toBe(spec.CMD_STOP);
		expect(model.actions[0].targetId).toBe(0x08);
		expect(model.vu08).toEqual([15, 0]);
		expect(model.vu32).toEqual([25, 75]);
	});

	it('validates the canonical sample as clean', () => {
		expect(validate(buildCanonicalSample())).toEqual([]);
		expect(() => check(buildCanonicalSample())).not.toThrow();
	});

	it('preserves frame-data chunks through a round-trip', () => {
		const psg = new Uint8Array([0x50, 0x53, 0x47, 0x1a, 0xff, 0xfd]);
		const taym = makeTaym(makeTrak(50, 1), {
			chips: [makeChip(1773400, { name: 'AY', frameDataTag: 'PSG0' })],
			frameData: { PSG0: psg }
		});
		const reparsed = readTaym(writeTaym(taym));
		expect(reparsed.chips[0].frameDataTag).toBe('PSG0');
		expect(Array.from(reparsed.frameData.PSG0)).toEqual(Array.from(psg));
	});

	it('reports chips that reference missing frame-data payloads', () => {
		const taym = makeTaym(makeTrak(50, 1), {
			chips: [makeChip(1773400, { name: 'AY', frameDataTag: 'PSG0' })]
		});

		expect(validate(taym)).toContain('S6.2: CHIP[0] frame data PSG0 missing payload');
		expect(() => check(taym)).toThrow(/missing payload/);
	});
});
