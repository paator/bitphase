import { describe, expect, it } from 'vitest';
import { buildTaymSampleTables } from '@/lib/services/file/taym/taym-samples';
import { buildTaymFromCapture } from '@/lib/services/file/taym/taym-builder';
import { check } from '@/lib/services/file/taym/validate';
import { writeTaym } from '@/lib/services/file/taym/codec';
import * as spec from '@/lib/services/file/taym/spec';
import type { SongCaptureResult } from '@/lib/services/file/ay/psg-export';
import {
	createDisabledTaymSampleStates,
	createDisabledTimerCaptureStates,
	SAMPLE_NO_LOOP,
	volumeRegisterIndex,
	type HardwareTaymSampleState,
	type SongCaptureFrame
} from '@/lib/services/file/ay/ay-export-utils';

function baseFrame(): SongCaptureFrame {
	return {
		registers: [0, 0, 0, 0, 0, 0, 0, 0b00111111, 0, 0, 0, 0, 0, 0],
		...createDisabledTimerCaptureStates(),
		samples: createDisabledTaymSampleStates()
	};
}

const CLOCK = 1773400;
const TIMER_DIVIDER = 8;

function rateForPeriod(period: number): number {
	return CLOCK / (TIMER_DIVIDER * period);
}

function sampleFrame(
	channel: number,
	sample: Partial<HardwareTaymSampleState> & Pick<HardwareTaymSampleState, 'instanceId'>
): SongCaptureFrame {
	const frame = baseFrame();
	frame.samples![channel] = {
		enabled: true,
		sampleBytes: [255, 192, 128, 64, 0],
		loopIndex: 0,
		rateHz: rateForPeriod(40),
		volume: 15,
		...sample
	};
	return frame;
}

function capture(frames: SongCaptureFrame[]): SongCaptureResult {
	return {
		frames,
		orderIndices: [],
		instruments: [],
		chipFrequency: CLOCK,
		interruptFrequency: 50,
		isYm: false
	};
}

function sliceOf(tables: ReturnType<typeof buildTaymSampleTables>, mods: { firstAction: number }) {
	return tables.actions.slice(mods.firstAction, mods.firstAction + 2);
}

describe('buildTaymSampleTables', () => {
	it('emits no timers when no channel plays a sample', () => {
		const tables = buildTaymSampleTables([baseFrame(), baseFrame()]);
		expect(tables.timers).toHaveLength(0);
		expect(tables.mods).toHaveLength(0);
		expect(tables.ownedRegistersPerFrame).toEqual([[], []]);
	});

	it('maps a sample channel to a timer with a paired (amp-reg, 0x80) slice', () => {
		const frames = [sampleFrame(0, { instanceId: 1 }), sampleFrame(0, { instanceId: 1 })];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });

		expect(tables.timers).toHaveLength(1);
		expect(tables.timers[0].clockMode).toBe(spec.CLOCK_ABS_RATE_HZ);
		expect(tables.timers[0].clockDivider).toBe(0);

		const start = tables.mods[0];
		expect(start.command).toBe(spec.CMD_START);
		expect(start.baseTimerValue).toBe(spec.toFix16(rateForPeriod(40)));
		expect(start.timerLaneRef).toBe(spec.TLAN_NONE);
		expect(start.actionCount).toBe(2);
		expect(tables.tlanes).toHaveLength(0);
		expect(tables.vu32).toHaveLength(0);

		const [ampAction, ampltdAction] = sliceOf(tables, start);
		expect(ampAction.targetId).toBe(volumeRegisterIndex(0));
		expect(ampAction.sourceMode).toBe(spec.SRC_INLINE_VALUE);
		expect(ampAction.operand).toBe(15);
		expect(ampltdAction.targetId).toBe(spec.TGT_SAMPLE_AMPLITUDE);
		expect(ampltdAction.sourceMode).toBe(spec.SRC_BIND_LANE);
		expect(ampAction.targetId).toBeLessThan(ampltdAction.targetId);

		const lane = tables.lanes[ampltdAction.operand];
		expect(lane.valueType).toBe(spec.VT_U8);
		expect(lane.loopIndex).toBe(0);
		expect(tables.vu08.slice(lane.valueOffset, lane.valueOffset + lane.length)).toEqual([
			255, 192, 128, 64, 0
		]);

		expect(tables.ownedRegistersPerFrame[0]).toEqual([volumeRegisterIndex(0)]);
		expect(tables.ownedRegistersPerFrame[0]).not.toContain(spec.TGT_SAMPLE_AMPLITUDE);
		expect(tables.mods[1].command).toBe(spec.CMD_EMPTY);
	});

	it('encodes a one-shot sample lane with no loop', () => {
		const frames = [sampleFrame(0, { instanceId: 1, loopIndex: SAMPLE_NO_LOOP })];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		const [, ampltd] = sliceOf(tables, tables.mods[0]);
		expect(tables.lanes[ampltd.operand].loopIndex).toBe(spec.NO_LOOP);
	});

	it('emits START on note-on, EMPTY when held, STOP on release', () => {
		const frames = [
			baseFrame(),
			sampleFrame(0, { instanceId: 1 }),
			sampleFrame(0, { instanceId: 1 }),
			baseFrame()
		];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		const cmds = frames.map((_f, frame) => tables.mods[frame].command);
		expect(cmds).toEqual([spec.CMD_EMPTY, spec.CMD_START, spec.CMD_EMPTY, spec.CMD_STOP]);
	});

	it('re-STARTs when a new note begins (instanceId changes)', () => {
		const frames = [sampleFrame(0, { instanceId: 1 }), sampleFrame(0, { instanceId: 2 })];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		expect(tables.mods[0].command).toBe(spec.CMD_START);
		expect(tables.mods[1].command).toBe(spec.CMD_START);
	});

	it('MODULATEs pitch without touching the 0x80 lane phase', () => {
		const frames = [
			sampleFrame(0, { instanceId: 1, rateHz: rateForPeriod(40) }),
			sampleFrame(0, { instanceId: 1, rateHz: rateForPeriod(36) })
		];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		expect(tables.mods[0].command).toBe(spec.CMD_START);
		const mod = tables.mods[1];
		expect(mod.command).toBe(spec.CMD_MODULATE);
		expect(mod.baseTimerValue).toBe(spec.toFix16(rateForPeriod(36)));
		expect(mod.timerLaneRef).toBe(spec.TLAN_NONE);
		expect(mod.actionCount).toBe(2);
		expect(tables.tlanes).toHaveLength(0);
		expect(tables.vu32).toHaveLength(0);
		const [, startAmpltd] = sliceOf(tables, tables.mods[0]);
		const [, modAmpltd] = sliceOf(tables, mod);
		expect(modAmpltd.operand).toBe(startAmpltd.operand);
	});

	it('MODULATEs volume via the amp-reg inline, keeping pitch unchanged', () => {
		const frames = [
			sampleFrame(0, { instanceId: 1, volume: 15 }),
			sampleFrame(0, { instanceId: 1, volume: 8 })
		];
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		const mod = tables.mods[1];
		expect(mod.command).toBe(spec.CMD_MODULATE);
		expect(mod.timerLaneRef).toBe(spec.TLAN_UNCHANGED);
		expect(mod.baseTimerValue).toBe(0);
		const [amp, ampltd] = sliceOf(tables, mod);
		expect(amp.targetId).toBe(volumeRegisterIndex(0));
		expect(amp.operand).toBe(8);
		const [, startAmpltd] = sliceOf(tables, tables.mods[0]);
		expect(ampltd.operand).toBe(startAmpltd.operand);
	});

	it('shares one lane across two channels and volumes', () => {
		const frames = [baseFrame()];
		frames[0].samples![0] = {
			enabled: true,
			instanceId: 1,
			sampleBytes: [255, 0],
			loopIndex: 0,
			rateHz: rateForPeriod(40),
			volume: 15
		};
		frames[0].samples![2] = {
			enabled: true,
			instanceId: 2,
			sampleBytes: [255, 0],
			loopIndex: 0,
			rateHz: rateForPeriod(40),
			volume: 8
		};
		const tables = buildTaymSampleTables(frames, { chipClockHz: CLOCK });
		expect(tables.lanes).toHaveLength(1);
		expect(tables.timers).toHaveLength(2);
	});

	it('lets two channels START 0x80 in the same frame (validates)', () => {
		const frames = [baseFrame()];
		frames[0].samples![0] = {
			enabled: true,
			instanceId: 1,
			sampleBytes: [255, 0],
			loopIndex: 0,
			rateHz: rateForPeriod(40),
			volume: 15
		};
		frames[0].samples![2] = {
			enabled: true,
			instanceId: 2,
			sampleBytes: [255, 0],
			loopIndex: 0,
			rateHz: rateForPeriod(40),
			volume: 8
		};
		const taym = buildTaymFromCapture(capture(frames));
		expect(() => check(taym)).not.toThrow();
	});
});

describe('buildTaymFromCapture with samples', () => {
	it('produces a valid TAYM whose PSG omits the sample-owned volume register', () => {
		const frames = [
			sampleFrame(0, { instanceId: 1 }),
			sampleFrame(0, { instanceId: 1, rateHz: rateForPeriod(36) }),
			baseFrame()
		];
		const taym = buildTaymFromCapture(capture(frames));
		expect(() => check(taym)).not.toThrow();
		expect(() => writeTaym(taym)).not.toThrow();
		expect(taym.timers).toHaveLength(1);
		expect(taym.timers[0].clockMode).toBe(spec.CLOCK_ABS_RATE_HZ);
	});

	it('merges sample timers alongside effect timers with remapped references', () => {
		const frames: SongCaptureFrame[] = [baseFrame(), baseFrame()];
		frames[0].syncbuzzer[1] = {
			enabled: true,
			pwm: true,
			period: 869,
			periodLow: 803,
			waveform: [13, 9],
			waveformLoop: 0
		};
		frames[1].syncbuzzer[1] = { ...frames[0].syncbuzzer[1] };
		frames[0].samples![0] = {
			enabled: true,
			instanceId: 1,
			sampleBytes: [255, 0],
			loopIndex: 0,
			rateHz: rateForPeriod(40),
			volume: 15
		};
		frames[1].samples![0] = { ...frames[0].samples![0] };

		const taym = buildTaymFromCapture(capture(frames));
		expect(taym.timers).toHaveLength(2);
		expect(() => check(taym)).not.toThrow();

		const sampleStart = taym.mods.find(
			(mods) =>
				mods.command === spec.CMD_START &&
				taym.actions[mods.firstAction]?.targetId === volumeRegisterIndex(0)
		);
		expect(sampleStart).toBeDefined();
		const amp = taym.actions[sampleStart!.firstAction];
		expect(amp.targetId).toBe(volumeRegisterIndex(0));
		expect(amp.sourceMode).toBe(spec.SRC_INLINE_VALUE);
		expect(amp.operand).toBe(15);
		const ampltd = taym.actions[sampleStart!.firstAction + 1];
		expect(ampltd.targetId).toBe(spec.TGT_SAMPLE_AMPLITUDE);
		expect(ampltd.sourceMode).toBe(spec.SRC_BIND_LANE);
		const lane = taym.lanes[ampltd.operand];
		expect(taym.vu08.slice(lane.valueOffset, lane.valueOffset + lane.length)).toEqual([255, 0]);
	});
});
