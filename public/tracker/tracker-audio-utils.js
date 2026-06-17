import { PT3VolumeTable } from './pt3-volume-table.js';

export function advanceInstrumentRowPosition(position, rowsLength, loop) {
	const length = rowsLength > 0 ? rowsLength : 1;
	let next = position + 1;
	if (next >= length) {
		next = loop > 0 && loop < length ? loop : 0;
	}
	return next;
}

export function calculatePt3Volume(patternVolume, instrumentVolume) {
	const pattern = Math.max(0, Math.min(15, patternVolume));
	const instrument = Math.max(0, Math.min(15, instrumentVolume));
	return PT3VolumeTable[pattern][instrument];
}

export function getEffectiveTuningPeriod(state, channelIndex, maxPeriod = 2047) {
	const noteIndex = state.channelCurrentNotes[channelIndex];
	if (noteIndex < 0 || noteIndex >= state.currentTuningTable.length) return 0;
	let period = state.currentTuningTable[noteIndex];
	if (period <= 0) return 0;
	const toneSliding = state.channelToneSliding?.[channelIndex] || 0;
	const vibratoSliding = state.channelVibratoSliding?.[channelIndex] || 0;
	const detune = state.channelDetune?.[channelIndex] || 0;
	period += toneSliding + vibratoSliding + detune;
	if (period < 0) return 0;
	if (period > maxPeriod) return maxPeriod;
	return period;
}
