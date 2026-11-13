import { describe, expect, it } from 'vitest';
import { assignEffectsToGenericRow } from '@/lib/chips/base/channel-effect-columns';
import { AYFormatter } from '@/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { Effect, EffectType } from '@/lib/models/song';
import type { GenericRow } from '@/lib/models/song/generic';
import { rowMotionAtSample, rowSpansFromChanges } from '@/lib/services/visualize/playback-position';
import { choosePatternFontSize, patternContentWidth } from '@/lib/services/visualize/pattern-layout';
import { displayPt3Effects, pt3RecorderSchema } from '@/lib/services/visualize/pt3-effect-display';
import {
	selectYoutubeAudioBitrate,
	selectYoutubeVideoProfile
} from '@/lib/services/visualize/youtube-profile';

describe('pattern video timing', () => {
	it('turns row changes into spans and keeps the playhead inside the sounding row', () => {
		const spans = rowSpansFromChanges(
			[
				{ sampleIndex: 0, orderIndex: 0, row: 0 },
				{ sampleIndex: 100, orderIndex: 0, row: 1 },
				{ sampleIndex: 100, orderIndex: 1, row: 0 }
			],
			250
		);

		expect(spans).toEqual([
			{ sampleStart: 0, sampleEnd: 100, orderIndex: 0, row: 0 },
			{ sampleStart: 100, sampleEnd: 250, orderIndex: 1, row: 0 }
		]);
		expect(rowMotionAtSample(spans, 0)).toEqual({ orderIndex: 0, row: 0, fraction: 0 });
		expect(rowMotionAtSample(spans, 50).fraction).toBeCloseTo(0.5);
		expect(rowMotionAtSample(spans, 100)).toEqual({ orderIndex: 1, row: 0, fraction: 0 });
		expect(rowMotionAtSample(spans, 500).fraction).toBeCloseTo(149 / 150);
	});
});

describe('pattern video layout', () => {
	it('uses the largest font that fits the frame and the row', () => {
		expect(choosePatternFontSize(1920, 1080, () => 100)).toBe(30);
		expect(choosePatternFontSize(1920, 1080, (size) => size * 100)).toBe(19);
	});

	it('keeps the last channel at the pattern width', () => {
		expect(patternContentWidth(1920, 700, 12)).toBe(708);
		expect(patternContentWidth(640, 700, 12)).toBe(640);
	});
});

describe('pt3 effect display', () => {
	it('uses the PT3 command for portamento, speed, and envelope slides', () => {
		const formatter = new AYFormatter();
		const schema = pt3RecorderSchema(AY_CHIP_SCHEMA);
		const portamento: GenericRow = { note: 'C-4', instrument: 1, volume: 15 };
		const envelope: GenericRow = { note: 'D-4', instrument: 1, volume: 15 };
		const speed: GenericRow = { note: 'E-4', instrument: 1, volume: 15 };
		assignEffectsToGenericRow(portamento, [new Effect(EffectType.Portamento, 1, 0x23)], 1);
		assignEffectsToGenericRow(envelope, [null], 1);
		assignEffectsToGenericRow(speed, [new Effect(EffectType.Speed, 0, 0x06)], 1);
		const row = formatter.formatRow(
			{ envelopeValue: 0x10, noiseValue: 1 },
			[portamento, envelope, speed],
			0,
			schema
		);
		const shown = displayPt3Effects(row, schema, [1, 1, 1], [undefined, '9210']);

		expect(schema.globalTemplate).toBe('{envelopeValue} {noiseValue}');
		expect(row).toContain('P123');
		expect(row).not.toContain('9210');
		expect(shown).toContain('3123');
		expect(shown).toContain('9210');
		expect(shown).not.toContain('P');
		expect(row).toContain('S.06');
		expect(shown).toContain('B.06');
	});
});

describe('youtube encode profile', () => {
	it('picks the highest supported video profile and AAC bitrate', async () => {
		const video = await selectYoutubeVideoProfile(async (config) => config.height === 1440);
		expect(video.profile.label).toBe('1440p30');
		expect(video.profile.bitrate).toBe(16_000_000);

		const bitrate = await selectYoutubeAudioBitrate(async (value) => value === 256_000);
		expect(bitrate).toBe(256_000);
	});

	it('rejects browsers that cannot encode the upload formats', async () => {
		await expect(selectYoutubeVideoProfile(async () => false)).rejects.toThrow(/H\.264/);
		await expect(selectYoutubeAudioBitrate(async () => false)).rejects.toThrow(/AAC/);
	});
});
