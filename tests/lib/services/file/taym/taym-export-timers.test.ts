import { describe, expect, it } from 'vitest';
import {
	buildTaymTimerTables,
	TAYM_TIMER_DIVIDER
} from '@/lib/services/file/taym/taym-export-timers';
import { buildTaymFromCapture } from '@/lib/services/file/taym/taym-builder';
import { check } from '@/lib/services/file/taym/validate';
import { writeTaym } from '@/lib/services/file/taym/codec';
import * as spec from '@/lib/services/file/taym/spec';
import type { SongCaptureResult } from '@/lib/services/file/ay/psg-export';
import {
	createDisabledTimerCaptureStates,
	ENVELOPE_SHAPE_REGISTER,
	volumeRegisterIndex,
	type SongCaptureFrame
} from '@/lib/services/file/ay/ay-export-utils';

function baseFrame(): SongCaptureFrame {
	return {
		registers: [0, 0, 0, 0, 0, 0, 0, 0b00111111, 0, 0x1f, 0, 13, 0, 0xff],
		...createDisabledTimerCaptureStates()
	};
}

function syncBuzzerFrame(channel: number, period: number, periodLow: number): SongCaptureFrame {
	const frame = baseFrame();
	frame.syncbuzzer[channel] = {
		enabled: true,
		pwm: true,
		period,
		periodLow,
		waveform: [13, 9],
		waveformLoop: 0
	};
	return frame;
}

function capture(frames: SongCaptureFrame[], isYm = false): SongCaptureResult {
	return { frames, chipFrequency: 1773400, interruptFrequency: 50, isYm };
}

describe('buildTaymTimerTables', () => {
	it('emits no timers when no channel hosts an effect', () => {
		const tables = buildTaymTimerTables([baseFrame(), baseFrame()]);
		expect(tables.timers).toHaveLength(0);
		expect(tables.mods).toHaveLength(0);
		expect(tables.ownedRegistersPerFrame).toEqual([[], []]);
	});

	it('maps a sync-buzzer channel to one CHIP_PERIOD timer owning R13', () => {
		const frames = [syncBuzzerFrame(1, 869, 803), syncBuzzerFrame(1, 869, 803)];
		const tables = buildTaymTimerTables(frames);

		expect(tables.timers).toHaveLength(1);
		expect(tables.timers[0].clockMode).toBe(spec.CLOCK_CHIP_PERIOD);
		expect(tables.timers[0].clockDivider).toBe(TAYM_TIMER_DIVIDER);

		const start = tables.mods[0];
		expect(start.command).toBe(spec.CMD_START);
		expect(start.baseTimerValue).toBe(869);
		const action = tables.actions[start.firstAction];
		expect(action.targetId).toBe(ENVELOPE_SHAPE_REGISTER);
		expect(action.sourceMode).toBe(spec.SRC_BIND_LANE);
		const lane = tables.lanes[action.operand];
		expect(tables.vu08.slice(lane.valueOffset, lane.valueOffset + lane.length)).toEqual([
			13, 9
		]);

		const tlan = tables.tlanes[start.timerLaneRef];
		expect(tables.vu32.slice(tlan.valueOffset, tlan.valueOffset + tlan.length)).toEqual([
			869, 803
		]);

		expect(tables.ownedRegistersPerFrame[0]).toContain(ENVELOPE_SHAPE_REGISTER);
	});

	it('emits START on (re)arm, EMPTY when steady, STOP on release', () => {
		const frames = [
			baseFrame(),
			syncBuzzerFrame(1, 869, 803),
			syncBuzzerFrame(1, 869, 803),
			baseFrame()
		];
		const tables = buildTaymTimerTables(frames);
		const nt = tables.timers.length;
		const cmds = frames.map((_f, frame) => tables.mods[frame * nt].command);
		expect(cmds).toEqual([spec.CMD_EMPTY, spec.CMD_START, spec.CMD_EMPTY, spec.CMD_STOP]);
	});

	it('emits MODULATE when only the period sweeps', () => {
		const frames = [syncBuzzerFrame(1, 869, 803), syncBuzzerFrame(1, 936, 736)];
		const tables = buildTaymTimerTables(frames);
		const nt = tables.timers.length;
		expect(tables.mods[0].command).toBe(spec.CMD_START);
		expect(tables.mods[1 * nt].command).toBe(spec.CMD_MODULATE);
		expect(tables.mods[1 * nt].baseTimerValue).toBe(936);
	});

	it('owns the volume register for a SID channel', () => {
		const frame = baseFrame();
		frame.sid[0] = {
			enabled: true,
			pwm: false,
			period: 500,
			periodLow: 500,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const tables = buildTaymTimerTables([frame, frame]);
		expect(tables.actions[0].targetId).toBe(volumeRegisterIndex(0));
		expect(tables.ownedRegistersPerFrame[0]).toContain(volumeRegisterIndex(0));
	});

	it('quantizes SID volume lanes with the selected chip DAC curve', () => {
		const frame = baseFrame();
		frame.sid[0] = {
			enabled: true,
			pwm: false,
			period: 500,
			periodLow: 500,
			baseVolume: 10,
			waveform: [7],
			waveformLoop: 0
		};

		const ayTables = buildTaymTimerTables([frame], { chipVariant: 'AY' });
		const ayLane = ayTables.lanes[ayTables.actions[0].operand];
		expect(ayTables.vu08.slice(ayLane.valueOffset, ayLane.valueOffset + ayLane.length)).toEqual(
			[4]
		);

		const ymTables = buildTaymTimerTables([frame], { chipVariant: 'YM' });
		const ymLane = ymTables.lanes[ymTables.actions[0].operand];
		expect(ymTables.vu08.slice(ymLane.valueOffset, ymLane.valueOffset + ymLane.length)).toEqual(
			[2]
		);
	});

	it('produces a valid TAYM file whose PSG omits timer-owned registers', () => {
		const frames = [syncBuzzerFrame(1, 869, 803), syncBuzzerFrame(1, 936, 736)];
		const taym = buildTaymFromCapture(capture(frames));
		expect(() => check(taym)).not.toThrow();
		expect(() => writeTaym(taym)).not.toThrow();
		expect(taym.timers).toHaveLength(1);
		expect(taym.chips[0].frameDataTag).toBe('PSG0');
	});

	it('uses capture chip variant when exporting SID timer lanes', () => {
		const frame = baseFrame();
		frame.sid[0] = {
			enabled: true,
			pwm: false,
			period: 500,
			periodLow: 500,
			baseVolume: 10,
			waveform: [7],
			waveformLoop: 0
		};

		const taym = buildTaymFromCapture(capture([frame], true));
		const lane = taym.lanes[taym.actions[0].operand];
		expect(taym.vu08.slice(lane.valueOffset, lane.valueOffset + lane.length)).toEqual([2]);
	});
});
