import { describe, expect, it } from 'vitest';
import { saaHeaderRoutes, type SaaHeaderRoutePattern } from '@/lib/chips/saa/header-routes';

function pattern(
	rows: Array<{
		noise0?: number;
		noise1?: number;
		env0?: number;
		env1?: number;
		instruments?: Array<number | undefined>;
		effects?: Array<
			Array<{ effect: number; delay: number; parameter: number } | null> | undefined
		>;
	}>
): SaaHeaderRoutePattern {
	const channelCount = 6;
	return {
		id: 0,
		length: rows.length,
		patternRows: rows.map((row) => ({
			noise0: row.noise0,
			noise1: row.noise1,
			env0: row.env0,
			env1: row.env1
		})),
		channels: Array.from({ length: channelCount }, (_, channel) => ({
			rows: rows.map((row) => ({
				instrument: row.instruments?.[channel],
				effects: row.effects?.[channel]
			}))
		}))
	};
}

const noiseInstrument = { id: '01', macros: { noise: { values: [true] } } };
const toneInstrument = { id: '02', macros: { noise: { values: [false] } } };

describe('saaHeaderRoutes', () => {
	it('stays quiet when nobody is using noise or the envelope', () => {
		expect(
			saaHeaderRoutes({
				patterns: [pattern([{}])],
				patternOrder: [0],
				orderIndex: 0,
				row: 0,
				instruments: [toneInstrument]
			})
		).toEqual([]);
	});

	it('marks each channel that uses a fixed noise clock on its own', () => {
		const routes = saaHeaderRoutes({
			patterns: [
				pattern([
					{
						noise0: -1,
						instruments: [1, undefined, 1]
					}
				])
			],
			patternOrder: [0],
			orderIndex: 0,
			row: 0,
			instruments: [noiseInstrument]
		});
		expect(routes).toEqual([
			{
				fromIndex: 0,
				toIndices: [],
				label: 'high',
				tone: 'noise',
				lane: 1,
				arrow: false
			},
			{
				fromIndex: 2,
				toIndices: [],
				label: 'high',
				tone: 'noise',
				lane: 1,
				arrow: false
			}
		]);
	});

	it('points channel A at the other channels when it clocks their noise', () => {
		const routes = saaHeaderRoutes({
			patterns: [
				pattern([
					{
						noise0: 3,
						instruments: [undefined, 1, 1]
					}
				])
			],
			patternOrder: [0],
			orderIndex: 0,
			row: 0,
			instruments: [noiseInstrument]
		});
		expect(routes).toEqual([
			{
				fromIndex: 0,
				toIndices: [1, 2],
				label: 'noise',
				tone: 'noise',
				lane: 1,
				arrow: true
			}
		]);
	});

	it('marks channel A when it clocks the noise and plays it', () => {
		const routes = saaHeaderRoutes({
			patterns: [
				pattern([
					{
						noise0: 3,
						instruments: [1, 1]
					}
				])
			],
			patternOrder: [0],
			orderIndex: 0,
			row: 0,
			instruments: [noiseInstrument]
		});
		expect(routes).toEqual([
			{
				fromIndex: 0,
				toIndices: [1],
				label: 'noise',
				tone: 'noise',
				lane: 1,
				arrow: true
			},
			{
				fromIndex: 0,
				toIndices: [],
				label: 'noise',
				tone: 'noise',
				lane: 1,
				arrow: false
			}
		]);
	});

	it('marks channel A when it is the only channel playing locked noise', () => {
		expect(
			saaHeaderRoutes({
				patterns: [
					pattern([
						{
							noise0: 3,
							instruments: [1]
						}
					])
				],
				patternOrder: [0],
				orderIndex: 0,
				row: 0,
				instruments: [noiseInstrument]
			})
		).toEqual([
			{
				fromIndex: 0,
				toIndices: [],
				label: 'noise',
				tone: 'noise',
				lane: 1,
				arrow: false
			}
		]);
	});

	it('points channel B at channel C while an envelope shape is running', () => {
		const routes = saaHeaderRoutes({
			patterns: [pattern([{ env0: 0x10 }, { env0: 0 }])],
			patternOrder: [0],
			orderIndex: 0,
			row: 1
		});
		expect(routes).toEqual([
			{
				fromIndex: 1,
				toIndices: [2],
				label: 'env',
				tone: 'envelope',
				lane: 0,
				arrow: true
			}
		]);
	});

	it('keeps the envelope link on the same row when noise is showing too', () => {
		const routes = saaHeaderRoutes({
			patterns: [
				pattern([
					{
						noise0: -1,
						env0: 0x10,
						instruments: [1, undefined, 1]
					}
				])
			],
			patternOrder: [0],
			orderIndex: 0,
			row: 0,
			instruments: [noiseInstrument]
		});
		expect(routes.find((route) => route.label === 'env')?.lane).toBe(0);
		expect(routes.find((route) => route.label === 'high')?.lane).toBe(1);
	});

	it('drops the envelope link after an off command', () => {
		expect(
			saaHeaderRoutes({
				patterns: [pattern([{ env0: 0x10 }, { env0: -1 }])],
				patternOrder: [0],
				orderIndex: 0,
				row: 1
			})
		).toEqual([]);
	});

	it('locks the noise clock from E2 even when the N column says high', () => {
		const routes = saaHeaderRoutes({
			patterns: [
				pattern([
					{
						noise0: -1,
						instruments: [2, 1],
						effects: [[{ effect: 'E'.charCodeAt(0), delay: 2, parameter: 1 }]]
					}
				])
			],
			patternOrder: [0],
			orderIndex: 0,
			row: 0,
			instruments: [noiseInstrument, toneInstrument]
		});
		expect(routes[0]).toMatchObject({
			fromIndex: 0,
			toIndices: [1],
			label: 'noise',
			arrow: true
		});
	});

	it('points channel E at channel F for the second envelope', () => {
		const routes = saaHeaderRoutes({
			patterns: [pattern([{ env1: 0x20 }])],
			patternOrder: [0],
			orderIndex: 0,
			row: 0
		});
		expect(routes).toEqual([
			{
				fromIndex: 4,
				toIndices: [5],
				label: 'env',
				tone: 'envelope',
				lane: 0,
				arrow: true
			}
		]);
	});
});
