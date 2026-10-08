export const NES_ENVELOPE_MODE_SUBCOMMAND = 6;
const ENVELOPE_MODE_MASK = 0x03;
const ENVELOPE_MODE_BITS = 0x30;

export function isNesEnvelopeModeEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_ENVELOPE_MODE_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

export function processNesEnvelopeModeEffect(state, channelIndex, row, hardwareType) {
	const active = state.channelEnvelopeModeActive;
	if (!active || !state.channelEnvelopeMode) return;
	if ((hardwareType > 1 && hardwareType !== 3) || state.channelMuted?.[channelIndex]) return;
	const effect = row?.effects?.find((entry) => isNesEnvelopeModeEffect(entry));
	if (!effect) return;
	active[channelIndex] = true;
	state.channelEnvelopeMode[channelIndex] = effect.parameter & ENVELOPE_MODE_MASK;
}

export function applyNesEnvelopeMode(channel, hardwareType, mode) {
	if (!channel || (hardwareType > 1 && hardwareType !== 3)) return;
	if (channel.volumeReg < 0) return;
	channel.volumeReg =
		(channel.volumeReg & ~ENVELOPE_MODE_BITS) | ((mode & ENVELOPE_MODE_MASK) << 4);
}
