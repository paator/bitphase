export const NES_LINEAR_COUNTER_SUBCOMMAND = 8;
const TRIANGLE_HARDWARE_CHANNEL = 2;

export function isNesLinearCounterEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_LINEAR_COUNTER_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

export function processNesLinearCounterEffect(state, channelIndex, row, hardwareType) {
	const active = state.channelLinearCounterActive;
	const reload = state.channelLinearCounterReload;
	if (!active || !state.channelLinearCounter || !reload) return;
	reload[channelIndex] = false;
	if (hardwareType !== TRIANGLE_HARDWARE_CHANNEL || state.channelMuted?.[channelIndex]) return;
	const effect = row?.effects?.find((entry) => isNesLinearCounterEffect(entry));
	if (!effect) return;
	active[channelIndex] = true;
	state.channelLinearCounter[channelIndex] = effect.parameter & 0xff;
	reload[channelIndex] = true;
}

export function applyNesLinearCounter(channel, hardwareType, value) {
	if (!channel || hardwareType !== TRIANGLE_HARDWARE_CHANNEL) return;
	channel.linearReg = value & 0xff;
}
