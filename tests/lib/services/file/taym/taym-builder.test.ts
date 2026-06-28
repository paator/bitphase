import { describe, expect, it } from 'vitest';
import { buildTaymFromCapture, ST_MONO_LAYOUT } from '@/lib/services/file/taym/taym-builder';
import { readTaym, writeTaym } from '@/lib/services/file/taym/codec';
import { readTaymFile } from '@/lib/services/file/taym/taym-reader';
import { check } from '@/lib/services/file/taym/validate';
import * as spec from '@/lib/services/file/taym/spec';
import { encodePSG, type SongCaptureResult } from '@/lib/services/file/ay/psg-export';
import {
	createDisabledTimerCaptureStates,
	type SongCaptureFrame
} from '@/lib/services/file/ay/ay-export-utils';

function frame(registers: number[]): SongCaptureFrame {
	return { registers, ...createDisabledTimerCaptureStates() };
}

function capture(frames: SongCaptureFrame[], isYm = false): SongCaptureResult {
	return {
		frames,
		chipFrequency: 1773400,
		interruptFrequency: 50,
		isYm
	};
}

describe('buildTaymFromCapture', () => {
	const frames = [
		frame([0xfd, 0x00, 0, 0, 0, 0, 0, 0b111110, 0x0f, 0, 0, 0, 0, 0]),
		frame([0xfd, 0x00, 0, 0, 0, 0, 0, 0b111110, 0x00, 0, 0, 0, 0, 0])
	];

	it('writes a single AY chip with frame_rate, frame_count and clock from the capture', () => {
		const taym = buildTaymFromCapture(capture(frames));
		expect(taym.trak.frameRateHz).toBe(50);
		expect(taym.trak.frameCount).toBe(2);
		expect(taym.chips).toHaveLength(1);
		expect(taym.chips[0].clockHz).toBe(1773400);
		expect(taym.chips[0].chipTypeId).toBe(spec.CHIP_TYPE_AY);
		expect(taym.chips[0].variant).toBe(spec.AY_VARIANT_AY);
		expect(taym.chips[0].frameDataTag).toBe('PSG0');
	});

	it('selects the YM variant for YM captures', () => {
		const taym = buildTaymFromCapture(capture(frames, true));
		expect(taym.chips[0].variant).toBe(spec.AY_VARIANT_YM);
	});

	it('embeds the PSG frame-data identical to encodePSG', () => {
		const taym = buildTaymFromCapture(capture(frames));
		const expected = new Uint8Array(encodePSG(frames.map((f) => f.registers)));
		expect(Array.from(taym.frameData.PSG0)).toEqual(Array.from(expected));
	});

	it('produces a valid, writable TAYM file', () => {
		const taym = buildTaymFromCapture(capture(frames));
		expect(() => check(taym)).not.toThrow();
		const buffer = writeTaym(taym);
		expect(() => readTaymFile(buffer)).not.toThrow();
	});

	it('maps the stereo layout into CHIP.config', () => {
		expect(buildTaymFromCapture(capture(frames)).chips[0].config).toBe(spec.AY_LAYOUT_ABC);
		expect(
			buildTaymFromCapture(capture(frames), { metadata: { stereoLayout: 'ACB' } }).chips[0].config
		).toBe(spec.AY_LAYOUT_ACB);
		expect(
			buildTaymFromCapture(capture(frames), { metadata: { stereoLayout: 'CAB' } }).chips[0].config
		).toBe(spec.AY_LAYOUT_CAB);
		expect(
			buildTaymFromCapture(capture(frames), { metadata: { stereoLayout: 'mono' } }).chips[0].config
		).toBe(spec.AY_LAYOUT_MONO);
		expect(
			buildTaymFromCapture(capture(frames), { metadata: { stereoLayout: ST_MONO_LAYOUT } }).chips[0]
				.config
		).toBe(spec.AY_LAYOUT_ST_MONO);
	});

	it('writes title, author, tuning table and instrument names into an INFO chunk', () => {
		const taym = buildTaymFromCapture(capture(frames), {
			metadata: {
				title: 'My Song',
				author: 'Me',
				tuningTable: 'ProTracker 3.3',
				instruments: ['Lead', 'Bass', '']
			}
		});
		expect(taym.info).toEqual({
			title: 'My Song',
			author: 'Me',
			tuning: 'ProTracker 3.3',
			instruments: 'Lead, Bass'
		});
		expect(() => check(taym)).not.toThrow();
		const reparsed = readTaym(writeTaym(taym));
		expect(reparsed.info).toEqual(taym.info);
	});

	it('omits empty metadata entries', () => {
		const taym = buildTaymFromCapture(capture(frames), {
			metadata: { title: '', author: undefined, instruments: ['', ''] }
		});
		expect(taym.info).toEqual({});
	});
});
