import { describe, expect, it } from 'vitest';
import { encodeTMR, TMR_HEADER_SIZE } from '@/lib/services/file/tmr/tmr-encoder';
import { parseEventList, TEL_HEADER_SIZE } from '@/lib/services/file/tmr/tmr-event-list';
import {
	attachEventListToTmrFile,
	buildTmrSchedule,
	formatEventItemWrites,
	formatScheduleTimeMs,
	formatTimerFrequencyHz,
	formatTimerSlotSummary,
	parseTMR,
	resolveTimerCommand
} from '@/lib/services/file/tmr/tmr-parser';
import { exportTimerFrequencyHzFromYmPeriod } from '@/lib/services/file/tmr/tmr-format';
import type { SongCaptureFrame } from '@/lib/services/file/ay/ay-export-utils';
import { createDisabledTimerCaptureStates } from '@/lib/services/file/ay/ay-export-utils';

function disabledSidFrame(): SongCaptureFrame {
	return {
		registers: new Array(14).fill(0),
		...createDisabledTimerCaptureStates()
	};
}

function parseEncoded(frames: SongCaptureFrame[]) {
	const encoded = encodeTMR(frames, {
		chipFrequency: 1773400,
		interruptFrequency: 50
	});
	const tmr = parseTMR(encoded.tmr);
	const tel = parseEventList(encoded.eventList);
	expect(tmr.ok).toBe(true);
	expect(tel.ok).toBe(true);
	if (!tmr.ok || !tel.ok) {
		throw new Error('parse failed');
	}
	return attachEventListToTmrFile(tmr.file, tel.file.eventItems);
}

describe('tmr parser', () => {
	it('parses a valid exported TMR and TEL pair', () => {
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = {
			enabled: true,
			period: 1000,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const file = parseEncoded([onFrame, disabledSidFrame()]);

		expect(file.header.frameCount).toBe(2);
		expect(file.header.frameRateHz).toBeCloseTo(50);
		expect(file.eventItems).toHaveLength(2);
		expect(file.frames[0]!.timers[0]!.command).toBe('start');
		expect(file.frames[1]!.timers[0]!.command).toBe('stop');
		expect(formatEventItemWrites(file.eventItems[0]!)).toContain('R8=0x0F');
		expect(file.eventItems[0]!.timerIndex).toBe(0);
	});

	it('reports invalid magic', () => {
		const buffer = new ArrayBuffer(32);
		const result = parseTMR(buffer);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.errors.some((error) => error.includes('Invalid magic'))).toBe(true);
	});

	it('classifies timer commands', () => {
		expect(resolveTimerCommand(0, 0)).toBe('none');
		expect(formatTimerSlotSummary({ frequencyHz: 0, eventIndex: 0, command: 'none' })).toBe('—');
		expect(formatTimerSlotSummary({ frequencyHz: 0, eventIndex: 0xffff, command: 'stop' })).toBe('STOP');
		expect(
			formatTimerSlotSummary({ frequencyHz: 1773.4, eventIndex: 3, command: 'start' })
		).toContain('event #3');
	});

	it('parses timer index from event item psg mask', () => {
		const frame = disabledSidFrame();
		frame.sid[2] = {
			enabled: true,
			period: 600,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const file = parseEncoded([frame]);
		expect(file.eventItems[0]!.timerIndex).toBe(2);
		expect(file.eventItems[0]!.registerApplyMask).toBe(0x0020);
	});

	it('builds a schedule of timer start, fire, and stop events', () => {
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = {
			enabled: true,
			period: 1000,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const file = parseEncoded([onFrame, disabledSidFrame()]);
		const schedule = buildTmrSchedule(file);
		expect(schedule.chipTicksPerFrame).toBe(35468);
		expect(schedule.entries[0]?.kind).toBe('start');
		expect(schedule.entries.at(-1)?.kind).toBe('stop');

		const fires = schedule.entries.filter((entry) => entry.kind === 'fire');
		expect(fires.length).toBeGreaterThan(1);

		const chipFrequency = 1773400;
		const ymPeriod = 1000;
		const exportHz = exportTimerFrequencyHzFromYmPeriod(chipFrequency, ymPeriod);
		const timerPeriodTicks = Math.round(chipFrequency / exportHz);

		const firstFire = fires[0]!;
		expect(firstFire.tickInFrame).toBe(timerPeriodTicks - 1);
		expect(firstFire.eventIndex).toBe(0);
		expect(firstFire.eventTimerIndex).toBe(0);
		expect(firstFire.frequencyHz).toBeCloseTo(exportHz);
		expect(formatScheduleTimeMs(firstFire.timeMs)).toBe(
			formatScheduleTimeMs(((timerPeriodTicks - 1) / chipFrequency) * 1000)
		);
		expect(formatTimerFrequencyHz(firstFire.frequencyHz!)).toBe(formatTimerFrequencyHz(exportHz));
	});
});

describe('tel parser', () => {
	it('parses event list header and item count', () => {
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = {
			enabled: true,
			period: 1000,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const encoded = encodeTMR([onFrame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});
		const result = parseEventList(encoded.eventList);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.file.eventItems).toHaveLength(2);
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * 22);
		expect(new Uint8Array(encoded.eventList)[0]).toBe(0x54);
		expect(new Uint8Array(encoded.eventList)[1]).toBe(0x45);
		expect(new Uint8Array(encoded.eventList)[2]).toBe(0x4c);
	});
});
