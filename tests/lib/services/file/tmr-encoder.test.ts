import { describe, expect, it } from 'vitest';
import {
	encodeEventPsgApplyMask,
	encodeTMR,
	TMR_FRAME_SIZE,
	TMR_HEADER_SIZE,
	TMR_ITEM_SIZE,
	TMR_TIMER_EVENT_STOP
} from '@/lib/services/file/tmr-encoder';
import { parseEventList, TEL_HEADER_SIZE } from '@/lib/services/file/tmr-event-list';
import { attachEventListToTmrFile, parseTMR } from '@/lib/services/file/tmr-parser';
import {
	encodeTimerFrequencyHz,
	exportTimerFrequencyStoredFromYmPeriod
} from '@/lib/services/file/tmr-format';
import {
	registerApplyMask,
	registersChangedMask,
	volumeRegisterIndex,
	createDisabledTimerCaptureStates,
	toneRegisterApplyMask,
	envelopePeriodRegisterApplyMask,
	envelopeShapeRegisterApplyMask,
	type SongCaptureFrame
} from '@/lib/services/file/ay-export-utils';
import { computeFmTonePeriod, computeTimerPwmPeriods } from '@/lib/chips/ay/instrument';

function storedTimerHz(period: number, psgClockHz = 1773400): number {
	return exportTimerFrequencyStoredFromYmPeriod(period, psgClockHz);
}

function readU16LE(buffer: ArrayBuffer, offset: number): number {
	return new DataView(buffer).getUint16(offset, true);
}

function readU32LE(buffer: ArrayBuffer, offset: number): number {
	return new DataView(buffer).getUint32(offset, true);
}

function readU8(buffer: ArrayBuffer, offset: number): number {
	return new DataView(buffer).getUint8(offset);
}

function disabledSidFrame(registers: number[] = new Array(14).fill(0)): SongCaptureFrame {
	return {
		registers,
		...createDisabledTimerCaptureStates()
	};
}

function parseEncoded(frames: SongCaptureFrame[], options = { chipFrequency: 1773400, interruptFrequency: 50 }) {
	const encoded = encodeTMR(frames, options);
	const tmr = parseTMR(encoded.tmr);
	const tel = parseEventList(encoded.eventList);
	expect(tmr.ok).toBe(true);
	expect(tel.ok).toBe(true);
	if (!tmr.ok || !tel.ok) {
		throw new Error('encode/decode failed');
	}
	return attachEventListToTmrFile(tmr.file, tel.file.eventItems);
}

describe('tmr encoder', () => {
	it('writes little-endian header and frame count', () => {
		const encoded = encodeTMR([disabledSidFrame(), disabledSidFrame()], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});
		const bytes = new Uint8Array(encoded.tmr);
		expect(bytes[0]).toBe(0x54);
		expect(bytes[1]).toBe(0x4d);
		expect(bytes[2]).toBe(0x52);
		expect(bytes[3]).toBe(0x1a);
		expect(readU16LE(encoded.tmr, 4)).toBe(1);
		expect(readU16LE(encoded.tmr, 6)).toBe(TMR_HEADER_SIZE);
		expect(readU32LE(encoded.tmr, 12)).toBe(Math.round(50 * 65536));
		expect(readU32LE(encoded.tmr, 16)).toBe(1773400);
		expect(readU32LE(encoded.tmr, 20)).toBe(2);
		expect(encoded.tmr.byteLength).toBe(TMR_HEADER_SIZE + 2 * TMR_FRAME_SIZE);
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE);
	});

	it('starts timer 1 with SID event chain on channel A', () => {
		const registers = new Array(14).fill(0);
		registers[8] = 0x0f;
		const frame = disabledSidFrame(registers);
		frame.sid[0] = {
			enabled: true,
			period: 1000,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const volumeMask = registerApplyMask(volumeRegisterIndex(0));
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE)).toBe(
			registersChangedMask(registers, new Array(14).fill(0))
		);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE)).toBe(volumeMask);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(storedTimerHz(1000));
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(encoded.tmr.byteLength).toBe(TMR_HEADER_SIZE + TMR_FRAME_SIZE);
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.eventList, TEL_HEADER_SIZE + 14)).toBe(
			encodeEventPsgApplyMask(volumeMask, 0)
		);
	});

	it('emits timer stop when SID turns off', () => {
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = {
			enabled: true,
			period: 500,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([onFrame, disabledSidFrame()], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const secondFrameOffset = TMR_HEADER_SIZE + TMR_FRAME_SIZE;
		expect(readU16LE(encoded.tmr, secondFrameOffset + 6)).toBe(TMR_TIMER_EVENT_STOP);
	});

	it('encodes timer index in event item psg mask bits 0-1', () => {
		const frame = disabledSidFrame();
		frame.sid[1] = {
			enabled: true,
			period: 800,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const volumeMask = registerApplyMask(volumeRegisterIndex(1));
		const encodedMask = readU16LE(encoded.eventList, TEL_HEADER_SIZE + 14);
		expect(encodedMask & volumeMask).toBe(volumeMask);
		expect(encodedMask).toBe(encodeEventPsgApplyMask(volumeMask, 1));
	});

	it('derives player frame psg mask from register changes between frames', () => {
		const silent = disabledSidFrame();
		const playing = disabledSidFrame();
		playing.registers[0] = 0x34;
		playing.registers[1] = 0x01;
		playing.registers[7] = 0x38;
		playing.registers[8] = 0x0f;

		const encoded = encodeTMR([silent, playing], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE)).toBe(0);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE)).toBe(
			registersChangedMask(playing.registers, silent.registers)
		);
	});

	it('keeps timer bits clear in player frame psg mask', () => {
		const frame = disabledSidFrame();
		frame.sid[1] = {
			enabled: true,
			period: 800,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE) & 0x0003).toBe(0);
	});

	it('restarts player timer when classic sid period changes', () => {
		const frames = [500, 520, 540, 560].map((period) => {
			const frame = disabledSidFrame();
			frame.sid[0] = {
				enabled: true,
				pwm: false,
				period,
				periodLow: period,
				baseVolume: 15,
				waveform: [0, 13],
				waveformLoop: 0
			};
			return frame;
		});

		const encoded = encodeTMR(frames, {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.tmr.byteLength).toBe(TMR_HEADER_SIZE + frames.length * TMR_FRAME_SIZE);
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(storedTimerHz(500));
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 2)).toBe(storedTimerHz(520));
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2 * TMR_FRAME_SIZE + 2)).toBe(
			storedTimerHz(540)
		);
	});

	it('allocates a fresh sid event chain for each pwm duty sweep step', () => {
		const duties = [5, 10, 15, 20, 25, 30, 35, 40, 45, 44, 43];
		const frames = duties.map((duty) => {
			const { highPeriod, lowPeriod } = computeTimerPwmPeriods(1000, duty);
			const frame = disabledSidFrame();
			frame.sid[0] = {
				enabled: true,
				pwm: true,
				period: highPeriod,
				periodLow: lowPeriod,
				baseVolume: 15,
				waveform: [15, 0],
				waveformLoop: 0
			};
			return frame;
		});

		const encoded = encodeTMR(frames, {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(
			TEL_HEADER_SIZE + duties.length * 2 * TMR_ITEM_SIZE
		);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(
			storedTimerHz(computeTimerPwmPeriods(1000, duties[0]!).highPeriod)
		);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 6)).toBe(2);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 2)).toBe(
			storedTimerHz(computeTimerPwmPeriods(1000, duties[1]!).highPeriod)
		);

		const secondDuty = duties[1]!;
		const { highPeriod, lowPeriod } = computeTimerPwmPeriods(1000, secondDuty);
		const secondChainOffset = TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE;
		expect(readU32LE(encoded.eventList, secondChainOffset + 16)).toBe(storedTimerHz(highPeriod));
		expect(readU32LE(encoded.eventList, secondChainOffset + TMR_ITEM_SIZE + 16)).toBe(
			storedTimerHz(lowPeriod)
		);
		expect(readU16LE(encoded.eventList, secondChainOffset + TMR_ITEM_SIZE + 20)).toBe(2);
	});

	it('reuses event chain after stop and start with same SID config', () => {
		const sidConfig = {
			enabled: true,
			period: 800,
			baseVolume: 15,
			waveform: [0, 13],
			waveformLoop: 0
		};
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = { ...sidConfig };
		const offFrame = disabledSidFrame();
		const onAgainFrame = disabledSidFrame();
		onAgainFrame.sid[0] = { ...sidConfig };

		const encoded = encodeTMR([onFrame, offFrame, onAgainFrame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 6)).toBe(TMR_TIMER_EVENT_STOP);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 2 * TMR_FRAME_SIZE + 6)).toBe(0);
	});

	it('reuses the sid event chain when SID restarts with a different period', () => {
		const sidConfig = {
			enabled: true,
			period: 800,
			baseVolume: 15,
			waveform: [0, 13],
			waveformLoop: 0
		};
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = { ...sidConfig };
		const offFrame = disabledSidFrame();
		const onAgainFrame = disabledSidFrame();
		onAgainFrame.sid[0] = { ...sidConfig, period: 900 };

		const encoded = encodeTMR([onFrame, offFrame, onAgainFrame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 6)).toBe(TMR_TIMER_EVENT_STOP);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 2 * TMR_FRAME_SIZE + 6)).toBe(0);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2 * TMR_FRAME_SIZE + 2)).toBe(storedTimerHz(900));
	});

	it('encodes sid event items with per-step timer frequencies when duty is asymmetric', () => {
		const frame = disabledSidFrame();
		frame.registers[8] = 0x0f;
		const { highPeriod, lowPeriod } = computeTimerPwmPeriods(1000, 25);
		frame.sid[0] = {
			enabled: true,
			pwm: true,
			period: highPeriod,
			periodLow: lowPeriod,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(storedTimerHz(highPeriod));
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(readU32LE(encoded.eventList, TEL_HEADER_SIZE + 16)).toBe(storedTimerHz(highPeriod));
		expect(readU32LE(encoded.eventList, TEL_HEADER_SIZE + TMR_ITEM_SIZE + 16)).toBe(
			storedTimerHz(lowPeriod)
		);
	});

	it('inherits timer frequency on sid event items when high and low periods match', () => {
		const frame = disabledSidFrame();
		frame.registers[8] = 0x0f;
		const { highPeriod } = computeTimerPwmPeriods(1000, 50);
		frame.sid[0] = {
			enabled: true,
			pwm: true,
			period: highPeriod,
			periodLow: highPeriod,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(storedTimerHz(highPeriod));
		expect(readU32LE(encoded.eventList, TEL_HEADER_SIZE + 16)).toBe(0);
		expect(readU32LE(encoded.eventList, TEL_HEADER_SIZE + TMR_ITEM_SIZE + 16)).toBe(0);
	});

	it('starts timer 1 with FM event chain on channel A', () => {
		const frame = disabledSidFrame();
		frame.registers[0] = 0x34;
		frame.registers[1] = 0x01;
		frame.fm[0] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			baseTonePeriod: 500,
			fmOffsetMode: 'semitone',
			waveform: [0, 7],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const toneMask = toneRegisterApplyMask(0);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + 2)).toBe(storedTimerHz(1000));
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + 6)).toBe(0);
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.eventList, TEL_HEADER_SIZE + 14)).toBe(
			encodeEventPsgApplyMask(toneMask, 0)
		);
		const firstTone = computeFmTonePeriod(500, 0, 'semitone');
		expect(readU8(encoded.eventList, TEL_HEADER_SIZE)).toBe(firstTone & 0xff);
		expect(readU8(encoded.eventList, TEL_HEADER_SIZE + 1)).toBe((firstTone >> 8) & 0x0f);
	});

	it('starts timer 2 with Env+FM event chain on channel B', () => {
		const frame = disabledSidFrame();
		frame.registers[11] = 0x10;
		frame.registers[12] = 0x03;
		frame.envFm[1] = {
			enabled: true,
			pwm: false,
			period: 800,
			periodLow: 800,
			baseEnvelopePeriod: 1000,
			fmOffsetMode: 'period',
			waveform: [0, 16],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const envelopeMask = envelopePeriodRegisterApplyMask();
		const secondTimerOffset = TMR_HEADER_SIZE + 8;
		expect(readU32LE(encoded.tmr, secondTimerOffset)).toBe(storedTimerHz(800));
		expect(readU16LE(encoded.tmr, secondTimerOffset + 4)).toBe(0);
		expect(readU16LE(encoded.eventList, TEL_HEADER_SIZE + 14)).toBe(
			encodeEventPsgApplyMask(envelopeMask, 1)
		);
	});

	it('starts timer 2 with a single-shape sync-buzzer event (self-looping)', () => {
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			period: 1000,
			waveform: [0x0d],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const shapeMask = envelopeShapeRegisterApplyMask();
		const secondTimerOffset = TMR_HEADER_SIZE + 8;
		expect(readU32LE(encoded.tmr, secondTimerOffset)).toBe(storedTimerHz(1000));
		expect(readU16LE(encoded.tmr, secondTimerOffset + 4)).toBe(0);
		// one event item, R13 = shape, mask = envelope shape on slot 1, next = self (0)
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + TMR_ITEM_SIZE);
		expect(readU8(encoded.eventList, TEL_HEADER_SIZE + 13)).toBe(0x0d);
		expect(readU16LE(encoded.eventList, TEL_HEADER_SIZE + 14)).toBe(
			encodeEventPsgApplyMask(shapeMask, 1)
		);
		expect(readU16LE(encoded.eventList, TEL_HEADER_SIZE + 20)).toBe(0);
	});

	it('emits an A/B two-shape sync-buzzer as a linked alternating chain', () => {
		// Regression: the exporter used to keep only waveform[0], dropping shape B
		// and self-looping a single event. An A/B sync-buzzer must export both
		// shapes as a 2-event chain that alternates (A -> B -> A).
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			period: 6960,
			waveform: [0x0d, 0x09],
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const shapeMask = envelopeShapeRegisterApplyMask();
		const secondTimerOffset = TMR_HEADER_SIZE + 8;
		expect(readU32LE(encoded.tmr, secondTimerOffset)).toBe(storedTimerHz(6960));
		expect(readU16LE(encoded.tmr, secondTimerOffset + 4)).toBe(0); // chain head = event 0

		// two event items
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		const ev0 = TEL_HEADER_SIZE;
		const ev1 = TEL_HEADER_SIZE + TMR_ITEM_SIZE;
		// event 0: shape A, next -> event 1
		expect(readU8(encoded.eventList, ev0 + 13)).toBe(0x0d);
		expect(readU16LE(encoded.eventList, ev0 + 14)).toBe(encodeEventPsgApplyMask(shapeMask, 1));
		expect(readU16LE(encoded.eventList, ev0 + 20)).toBe(1);
		// event 1: shape B, next -> event 0 (loop)
		expect(readU8(encoded.eventList, ev1 + 13)).toBe(0x09);
		expect(readU16LE(encoded.eventList, ev1 + 14)).toBe(encodeEventPsgApplyMask(shapeMask, 1));
		expect(readU16LE(encoded.eventList, ev1 + 20)).toBe(0);
	});

	it('round-trips a two-shape sync-buzzer chain through parse', () => {
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			period: 6960,
			waveform: [0x07, 0x0a],
			waveformLoop: 0
		};

		const merged = parseEncoded([frame]);
		expect(merged.eventItems).toHaveLength(2);
		expect(merged.eventItems[0]!.psgData[13]).toBe(0x07);
		expect(merged.eventItems[0]!.timerEventIndex).toBe(1);
		expect(merged.eventItems[1]!.psgData[13]).toBe(0x0a);
		expect(merged.eventItems[1]!.timerEventIndex).toBe(0);
	});

	it('emits per-event timer frequencies for a duty sync-buzzer (PWM skew)', () => {
		// Bassline first note: a sync-buzzer with a non-50% duty. Like SID PWM,
		// each waveform step rides a different timer period (high vs low phase),
		// so the .tel chain must carry BOTH timer frequencies -- not 0/inherit.
		// Regression: getOrCreateSyncBuzzerEventChain hardcoded timerFrequency 0,
		// flattening the duty to a single period (the .tmr slot period only).
		const periodHigh = 6960;
		const periodLow = 3480; // duty != 50% -> high phase != low phase
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			pwm: true,
			period: periodHigh,
			periodLow,
			waveform: [0x0d, 0x09], // 2 steps: step0 high phase, step1 low phase
			waveformLoop: 0
		};

		const encoded = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		const shapeMask = envelopeShapeRegisterApplyMask();
		const secondTimerOffset = TMR_HEADER_SIZE + 8;
		// .tmr Start carries the high-phase period (waveform[0]).
		expect(readU32LE(encoded.tmr, secondTimerOffset)).toBe(storedTimerHz(periodHigh));
		expect(readU16LE(encoded.tmr, secondTimerOffset + 4)).toBe(0);

		// two event items, each re-pitching the timer to its step period.
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * TMR_ITEM_SIZE);
		const ev0 = TEL_HEADER_SIZE;
		const ev1 = TEL_HEADER_SIZE + TMR_ITEM_SIZE;
		// event 0: shape A, high-phase freq, next -> event 1
		expect(readU8(encoded.eventList, ev0 + 13)).toBe(0x0d);
		expect(readU16LE(encoded.eventList, ev0 + 14)).toBe(encodeEventPsgApplyMask(shapeMask, 1));
		expect(readU32LE(encoded.eventList, ev0 + 16)).toBe(storedTimerHz(periodHigh));
		expect(readU16LE(encoded.eventList, ev0 + 20)).toBe(1);
		// event 1: shape B, low-phase freq, next -> event 0 (loop)
		expect(readU8(encoded.eventList, ev1 + 13)).toBe(0x09);
		expect(readU16LE(encoded.eventList, ev1 + 14)).toBe(encodeEventPsgApplyMask(shapeMask, 1));
		expect(readU32LE(encoded.eventList, ev1 + 16)).toBe(storedTimerHz(periodLow));
		expect(readU16LE(encoded.eventList, ev1 + 20)).toBe(0);
	});

	it('emits timer stop when FM turns off', () => {
		const onFrame = disabledSidFrame();
		onFrame.fm[0] = {
			enabled: true,
			pwm: false,
			period: 500,
			periodLow: 500,
			baseTonePeriod: 400,
			fmOffsetMode: 'semitone',
			waveform: [0, 7],
			waveformLoop: 0
		};

		const encoded = encodeTMR([onFrame, disabledSidFrame()], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 6)).toBe(TMR_TIMER_EVENT_STOP);
	});

	it('merges coexisting sync-buzzer and Env+FM into one LCM event chain', () => {
		// Regression: the channel loop used an if/else-if chain across
		// syncbuzzer -> sid -> fm -> envFm, so only the first active effect was
		// exported and the rest were silently dropped. A single hardware timer per
		// channel must drive ONE chain that writes every active register group per
		// step. With a 2-step sync-buzzer (R13) and a 3-step Env+FM (R11/R12) the
		// merged chain has LCM(2,3) = 6 steps.
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			waveform: [0x0d, 0x09],
			waveformLoop: 0
		};
		frame.envFm[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			baseEnvelopePeriod: 1000,
			fmOffsetMode: 'period',
			waveform: [0, 16, 32],
			waveformLoop: 0
		};

		const { eventItems } = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(eventItems).toHaveLength(6);
		const shapeMask = envelopeShapeRegisterApplyMask();
		const envelopeMask = envelopePeriodRegisterApplyMask();
		const combinedMask = encodeEventPsgApplyMask(shapeMask | envelopeMask, 1);

		for (let step = 0; step < 6; step++) {
			const item = eventItems[step]!;
			expect(item.psgMask).toBe(combinedMask);
			expect(item.timerEventIndex).toBe((step + 1) % 6);
			expect(item.psgData[13]).toBe(step % 2 === 0 ? 0x0d : 0x09);
		}

		const envPeriods = eventItems.map((item) => item.psgData[11]! | (item.psgData[12]! << 8));
		expect(envPeriods[0]).toBe(envPeriods[3]);
		expect(envPeriods[1]).toBe(envPeriods[4]);
		expect(envPeriods[2]).toBe(envPeriods[5]);
		expect(new Set(envPeriods.slice(0, 3)).size).toBe(3);
	});

	it('preserves nonzero waveform loop points in merged chains', () => {
		const frame = disabledSidFrame();
		frame.syncbuzzer[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			waveform: [0x0d, 0x09],
			waveformLoop: 0
		};
		frame.envFm[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			baseEnvelopePeriod: 1000,
			fmOffsetMode: 'period',
			waveform: [0, 16, 32],
			waveformLoop: 1
		};

		const { eventItems } = encodeTMR([frame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(eventItems).toHaveLength(3);
		expect(eventItems.map((item) => item.psgData[13])).toEqual([0x0d, 0x09, 0x0d]);
		const envPeriods = eventItems.map((item) => item.psgData[11]! | (item.psgData[12]! << 8));
		expect(new Set(envPeriods).size).toBe(3);
		expect(eventItems.map((item) => item.timerEventIndex)).toEqual([1, 2, 1]);
	});

	it('reuses merged event chain when only non-PWM period changes', () => {
		const makeFrame = (period: number): SongCaptureFrame => {
			const frame = disabledSidFrame();
			frame.syncbuzzer[1] = {
				enabled: true,
				pwm: false,
				period,
				periodLow: period,
				waveform: [0x0d, 0x09],
				waveformLoop: 0
			};
			frame.envFm[1] = {
				enabled: true,
				pwm: false,
				period,
				periodLow: period,
				baseEnvelopePeriod: 1000,
				fmOffsetMode: 'period',
				waveform: [0, 16, 32],
				waveformLoop: 0
			};
			return frame;
		};

		const encoded = encodeTMR([makeFrame(800), makeFrame(900)], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 6 * TMR_ITEM_SIZE);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 8)).toBe(storedTimerHz(900));
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 12)).toBe(0);
	});

	it('switches from merged chain back to single-effect chain', () => {
		const mergedFrame = disabledSidFrame();
		mergedFrame.syncbuzzer[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			waveform: [0x0d, 0x09],
			waveformLoop: 0
		};
		mergedFrame.envFm[1] = {
			enabled: true,
			pwm: false,
			period: 1000,
			periodLow: 1000,
			baseEnvelopePeriod: 1000,
			fmOffsetMode: 'period',
			waveform: [0, 16, 32],
			waveformLoop: 0
		};
		const singleFrame = disabledSidFrame();
		singleFrame.syncbuzzer[1] = { ...mergedFrame.syncbuzzer[1]! };

		const encoded = encodeTMR([mergedFrame, singleFrame], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 8 * TMR_ITEM_SIZE);
		expect(readU32LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 8)).toBe(
			storedTimerHz(1000)
		);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 12)).toBe(6);
	});

	it('restarts the merged timer when the shared period sweeps', () => {
		// project14 case: a duty sync-buzzer whose period sweeps every frame while
		// Env+FM rides the same timer. Each sweep must re-emit a fresh merged chain
		// (per-step timer frequencies are baked at chain build time) and restart the
		// timer, instead of inheriting (0) and freezing the sweep.
		const makeFrame = (period: number, periodLow: number): SongCaptureFrame => {
			const frame = disabledSidFrame();
			frame.syncbuzzer[1] = {
				enabled: true,
				pwm: true,
				period,
				periodLow,
				waveform: [0x0d, 0x09],
				waveformLoop: 0
			};
			frame.envFm[1] = {
				enabled: true,
				pwm: false,
				period,
				periodLow: period,
				baseEnvelopePeriod: 1000,
				fmOffsetMode: 'period',
				waveform: [0, 16, 32],
				waveformLoop: 0
			};
			return frame;
		};

		const frames = [makeFrame(435, 401), makeFrame(468, 368), makeFrame(502, 334)];
		const encoded = encodeTMR(frames, { chipFrequency: 1773400, interruptFrequency: 50 });

		const slotOffset = TMR_HEADER_SIZE + 8; // channel B timer slot
		// First frame launches the chain head.
		expect(readU16LE(encoded.tmr, slotOffset + 4)).toBe(0);
		expect(readU32LE(encoded.tmr, slotOffset + 2)).not.toBe(0);
		// Subsequent sweeps restart the timer at a fresh chain head (not inherit 0).
		for (let f = 1; f < frames.length; f++) {
			const off = TMR_HEADER_SIZE + f * TMR_FRAME_SIZE + 8;
			expect(readU32LE(encoded.tmr, off + 2)).not.toBe(0);
			expect(readU16LE(encoded.tmr, off + 4)).not.toBe(TMR_TIMER_EVENT_STOP);
		}
		// Three distinct 6-step merged chains were appended.
		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 3 * 6 * TMR_ITEM_SIZE);
	});

	it('rebuilds merged PWM chain when only the low period changes', () => {
		const makeFrame = (periodLow: number): SongCaptureFrame => {
			const frame = disabledSidFrame();
			frame.syncbuzzer[1] = {
				enabled: true,
				pwm: true,
				period: 435,
				periodLow,
				waveform: [0x0d, 0x09],
				waveformLoop: 0
			};
			frame.envFm[1] = {
				enabled: true,
				pwm: false,
				period: 435,
				periodLow: 435,
				baseEnvelopePeriod: 1000,
				fmOffsetMode: 'period',
				waveform: [0, 16, 32],
				waveformLoop: 0
			};
			return frame;
		};

		const encoded = encodeTMR([makeFrame(401), makeFrame(368)], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});

		expect(encoded.eventList.byteLength).toBe(TEL_HEADER_SIZE + 2 * 6 * TMR_ITEM_SIZE);
		expect(readU16LE(encoded.tmr, TMR_HEADER_SIZE + TMR_FRAME_SIZE + 12)).toBe(6);
	});
});

describe('tmr split files', () => {
	it('parses tmr without embedded event list until tel is attached', () => {
		const onFrame = disabledSidFrame();
		onFrame.sid[0] = {
			enabled: true,
			period: 1000,
			baseVolume: 15,
			waveform: [15, 0],
			waveformLoop: 0
		};
		const encoded = encodeTMR([onFrame, disabledSidFrame()], {
			chipFrequency: 1773400,
			interruptFrequency: 50
		});
		const tmrOnly = parseTMR(encoded.tmr);
		expect(tmrOnly.ok).toBe(true);
		if (!tmrOnly.ok) {
			return;
		}
		expect(tmrOnly.file.eventItems).toHaveLength(0);

		const merged = parseEncoded([onFrame, disabledSidFrame()]);
		expect(merged.eventItems).toHaveLength(2);
	});
});
