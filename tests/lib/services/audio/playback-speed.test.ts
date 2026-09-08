import { describe, expect, it } from 'vitest';
import type { Pattern } from '../../../../src/lib/models/song';
import { Table } from '../../../../src/lib/models/project';
import {
	findLastSpeedCommand,
	readLastSpeedCommandOnRow,
	resolveSpeedCommand
} from '../../../../src/lib/services/audio/playback-speed';

const SPEED = 'S'.charCodeAt(0);

function speedEffect(parameter: number, tableIndex?: number) {
	return tableIndex === undefined
		? { effect: SPEED, delay: 0, parameter }
		: { effect: SPEED, delay: 0, parameter, tableIndex };
}

function makePattern(
	id: number,
	length: number,
	channelEffects: Array<Array<unknown>>
): Pattern {
	return {
		id,
		length,
		channels: channelEffects.map((rows, index) => ({
			label: String.fromCharCode(65 + index),
			effectColumnCount: 2,
			rows: rows.map((effects) => ({
				note: { name: 2, octave: 1 },
				effects
			}))
		})),
		patternRows: Array.from({ length }, () => ({}))
	} as Pattern;
}

describe('readLastSpeedCommandOnRow', () => {
	it('reads a speed command from a later effect column', () => {
		const pattern = makePattern(0, 1, [[[null, speedEffect(8)]]]);
		expect(readLastSpeedCommandOnRow(pattern.channels, 0)).toEqual({
			parameter: 8
		});
	});

	it('keeps the last speed command on the row', () => {
		const pattern = makePattern(0, 1, [
			[[speedEffect(3)]],
			[[speedEffect(6)]]
		]);
		expect(readLastSpeedCommandOnRow(pattern.channels, 0)).toEqual({
			parameter: 6
		});
	});
});

describe('resolveSpeedCommand', () => {
	it('resolves S.TY to the first non-zero table value', () => {
		const tables = [new Table(1, [0, 0, 5, 3], 0)];
		expect(resolveSpeedCommand({ parameter: 0, tableIndex: 1 }, tables)).toEqual({
			speed: 5,
			speedTable: 1,
			speedTablePosition: 2
		});
	});

	it('resolves numeric speed and clears the table', () => {
		expect(resolveSpeedCommand({ parameter: 8 }, [])).toEqual({
			speed: 8,
			speedTable: -1,
			speedTablePosition: 0
		});
	});
});

describe('findLastSpeedCommand', () => {
	it('uses a later chip speed command on the shared timeline', () => {
		const chip0 = makePattern(0, 1, [[[null]]]);
		const chip1 = makePattern(0, 1, [[[null, speedEffect(8)]]]);
		expect(findLastSpeedCommand([[chip0], [chip1]], [0], 0, 0)).toEqual({
			speed: 8,
			speedTable: -1,
			speedTablePosition: 0,
			ownerChipIndex: 1
		});
	});

	it('prefers a later row on chip 0 over an earlier chip 1 command', () => {
		const chip0 = makePattern(0, 2, [[[null], [speedEffect(4)]]]);
		const chip1 = makePattern(0, 2, [[[speedEffect(9)], [null]]]);
		expect(findLastSpeedCommand([[chip0], [chip1]], [0], 0, 1)?.speed).toBe(4);
	});

	it('resolves S.TY from a previous pattern', () => {
		const first = makePattern(0, 1, [[[speedEffect(0, 2)]]]);
		const second = makePattern(1, 1, [[[null]]]);
		const tables = [new Table(2, [6, 3], 0)];
		expect(findLastSpeedCommand([[first, second]], [0, 1], 1, 0, tables)).toMatchObject({
			speed: 6,
			speedTable: 2,
			speedTablePosition: 0,
			ownerChipIndex: 0
		});
	});
});
