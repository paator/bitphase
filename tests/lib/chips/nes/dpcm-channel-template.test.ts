import { describe, expect, it } from 'vitest';
import { getChannelLayout } from '@/lib/chips/base/channel-effect-columns';
import { NESFormatter } from '@/lib/chips/nes/formatter';
import { NESConverter } from '@/lib/chips/nes/adapter';
import { NES_CHIP_SCHEMA, NES_DPCM_CHANNEL_INDEX } from '@/lib/chips/nes/schema';
import { Pattern } from '@/lib/models/song';
import { PatternTemplateParser } from '@/lib/services/pattern/editing/pattern-template-parsing';
import { listPianoRollLanes } from '@/lib/services/piano-roll/piano-roll-schema';

describe('NES DPCM channel template', () => {
	it('omits the volume column on the DPCM channel', () => {
		const pulse = getChannelLayout(NES_CHIP_SCHEMA, 1, 0);
		const dpcm = getChannelLayout(NES_CHIP_SCHEMA, 1, NES_DPCM_CHANNEL_INDEX);

		expect(pulse.template).toContain('{volume}');
		expect(dpcm.template).not.toContain('{volume}');
	});

	it('formats and parses a row without a DPCM volume column', () => {
		const pattern = new Pattern(0, 1, NES_CHIP_SCHEMA);
		for (const channel of pattern.channels) {
			channel.rows[0].instrument = 1;
			channel.rows[0].volume = 0xa;
		}

		const formatter = new NESFormatter();
		const generic = new NESConverter().toGeneric(pattern);
		const row = formatter.formatRow(
			generic.patternRows[0],
			generic.channels.map((channel) => channel.rows[0]),
			0,
			NES_CHIP_SCHEMA
		);
		const channels = row.split(/\s+/).slice(1);
		const channel = (index: number) => channels.slice(index * 3, index * 3 + 3);

		expect(channel(0)[1]).toBe('01.A');
		expect(channel(NES_DPCM_CHANNEL_INDEX)[1]).toBe('01.');

		const parsed = formatter.parseRow(row, NES_CHIP_SCHEMA);
		expect(parsed.channels[0].volume).toBe(0xa);
		expect(parsed.channels[NES_DPCM_CHANNEL_INDEX].volume).toBeUndefined();
	});

	it('keeps the volume column off virtual copies of DPCM', () => {
		const labels = ['Pulse 1:1', 'Pulse 1:2', 'Pulse 2', 'Triangle', 'Noise', 'DPCM:1'];
		const pattern = new Pattern(0, 1, NES_CHIP_SCHEMA, labels);
		for (const channel of pattern.channels) {
			channel.rows[0].instrument = 1;
			channel.rows[0].volume = 0xa;
		}

		const formatter = new NESFormatter();
		formatter.virtualChannelMap = { 0: 2 };
		const generic = new NESConverter().toGeneric(pattern);
		const row = formatter.formatRow(
			generic.patternRows[0],
			generic.channels.map((channel) => channel.rows[0]),
			0,
			NES_CHIP_SCHEMA,
			{ virtualChannelMap: formatter.virtualChannelMap }
		);

		expect(row.split(/\s+/).at(-2)).toBe('01.');
	});

	it('does not walk a volume field on the DPCM channel', () => {
		const pattern = new Pattern(0, 1, NES_CHIP_SCHEMA);
		const formatter = new NESFormatter();
		const generic = new NESConverter().toGeneric(pattern);
		const row = formatter.formatRow(
			generic.patternRows[0],
			generic.channels.map((channel) => channel.rows[0]),
			0,
			NES_CHIP_SCHEMA
		);
		const fields = new Map<number, string[]>();
		PatternTemplateParser.walkRow(row, NES_CHIP_SCHEMA, undefined, {
			onChannelField(channelIndex, key) {
				const list = fields.get(channelIndex) ?? [];
				list.push(key);
				fields.set(channelIndex, list);
			}
		});

		expect(fields.get(0)).toContain('volume');
		expect(fields.get(NES_DPCM_CHANNEL_INDEX)).not.toContain('volume');
	});

	it('drops the volume lane when the piano roll is on DPCM', () => {
		expect(listPianoRollLanes(NES_CHIP_SCHEMA, 1).map((lane) => lane.fieldKey)).toContain(
			'volume'
		);
		expect(
			listPianoRollLanes(NES_CHIP_SCHEMA, 1, NES_DPCM_CHANNEL_INDEX).map(
				(lane) => lane.fieldKey
			)
		).not.toContain('volume');
	});
});
