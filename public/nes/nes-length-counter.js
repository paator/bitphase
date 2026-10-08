export const NES_LENGTH_COUNTER_SUBCOMMAND = 5;
const LENGTH_COUNTER_INDEX_MASK = 0x1f;

export function isNesLengthCounterEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_LENGTH_COUNTER_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

export function processNesLengthCounterEffect(state, channelIndex, row, hardwareType) {
	const active = state.channelLengthCounterActive;
	const reload = state.channelLengthCounterReload;
	if (!active || !reload) return;
	reload[channelIndex] = false;
	if (hardwareType < 0 || hardwareType > 3) return;
	const effect = row?.effects?.find((entry) => isNesLengthCounterEffect(entry));
	if (!effect || state.channelMuted?.[channelIndex]) return;
	active[channelIndex] = true;
	state.channelLengthCounterIndex[channelIndex] = effect.parameter & LENGTH_COUNTER_INDEX_MASK;
	reload[channelIndex] = true;
}

export function applyNesLengthCounter(channel, hardwareType, index) {
	if (!channel || hardwareType < 0 || hardwareType > 3) return;
	channel.lengthNibble = index & LENGTH_COUNTER_INDEX_MASK;
	if (hardwareType <= 1 || hardwareType === 3) {
		if (channel.volumeReg >= 0) channel.volumeReg &= ~(1 << 5);
		return;
	}
	const linear = channel.linearReg >= 0 ? channel.linearReg : 0x7f;
	channel.linearReg = linear & 0x7f;
}
