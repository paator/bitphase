import { NOTE_RELEASE } from '../tracker/tracker-instrument-channel.js';

export const NES_DPCM_PITCH_SUBCOMMAND = 7;
export const NES_DPCM_HARDWARE_CHANNEL = 4;
const DPCM_PITCH_MASK = 0x0f;

export function isNesDpcmPitchEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_DPCM_PITCH_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

function isNewDpcmNote(row) {
	const name = row?.note?.name;
	return name !== undefined && name !== 0 && name !== 1 && name !== NOTE_RELEASE;
}

export function processNesDpcmPitchEffect(state, channelIndex, row, hardwareType) {
	const active = state.channelDpcmPitchActive;
	const pitch = state.channelDpcmPitch;
	const write = state.channelDpcmPitchWrite;
	if (!active || !pitch || !write) return;
	if (hardwareType !== NES_DPCM_HARDWARE_CHANNEL || state.channelMuted?.[channelIndex]) return;
	const effect = row?.effects?.find((entry) => isNesDpcmPitchEffect(entry));
	if (effect) {
		active[channelIndex] = true;
		pitch[channelIndex] = effect.parameter & DPCM_PITCH_MASK;
		write[channelIndex] = !isNewDpcmNote(row);
		return;
	}
	if (isNewDpcmNote(row)) {
		active[channelIndex] = false;
		write[channelIndex] = false;
	}
}
