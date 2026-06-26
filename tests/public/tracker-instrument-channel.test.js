import { describe, expect, it } from 'vitest';
import {
	assignPatternRowInstrument,
	channelHasAssignedInstrument,
	getChannelInstrument,
	isChannelOnOffHalted,
	processChannelOnOffCounters
} from '../../public/tracker/tracker-instrument-channel.js';

describe('tracker-instrument-channel', () => {
	const state = {
		channelInstruments: [-1, 1],
		instrumentPositions: [0, 0],
		instruments: [{ id: 1 }, { id: 2 }],
		instrumentIdToIndex: new Map([
			[1, 0],
			[2, 1]
		]),
		channelMuted: [false, false]
	};

	it('assigns instrument from pattern row', () => {
		const result = assignPatternRowInstrument(state, 0, { instrument: 1 });
		expect(result.assigned).toBe(true);
		expect(result.instrumentIndex).toBe(0);
		expect(state.channelInstruments[0]).toBe(0);
	});

	it('clears instrument when pattern row instrument is missing', () => {
		assignPatternRowInstrument(state, 0, { instrument: 99 });
		expect(state.channelInstruments[0]).toBe(-1);
		expect(channelHasAssignedInstrument(state, 0)).toBe(false);
	});

	it('reports assigned instrument for channel', () => {
		expect(getChannelInstrument(state, 1)).toEqual({
			instrumentIndex: 1,
			instrument: { id: 2 }
		});
		expect(channelHasAssignedInstrument(state, 1)).toBe(true);
	});

	it('processChannelOnOffCounters toggles channel sound during on/off effect', () => {
		const onOffState = {
			channelOnOffCounter: [3],
			channelOnDuration: [3],
			channelOffDuration: [2],
			channelSoundEnabled: [true]
		};

		processChannelOnOffCounters(onOffState, 1);
		expect(onOffState.channelOnOffCounter[0]).toBe(2);
		expect(onOffState.channelSoundEnabled[0]).toBe(true);

		processChannelOnOffCounters(onOffState, 1);
		expect(onOffState.channelOnOffCounter[0]).toBe(1);
		expect(onOffState.channelSoundEnabled[0]).toBe(true);

		processChannelOnOffCounters(onOffState, 1);
		expect(onOffState.channelOnOffCounter[0]).toBe(2);
		expect(onOffState.channelSoundEnabled[0]).toBe(false);
		expect(isChannelOnOffHalted(onOffState, 0)).toBe(true);
	});
});
