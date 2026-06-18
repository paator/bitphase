export function resetChipPlaybackOutput({
	registerState,
	audioDriver,
	chipEngine,
	applyRegisterState
}) {
	if (registerState) {
		registerState.reset();
	}
	if (audioDriver?.resetChannelMixerState) {
		audioDriver.resetChannelMixerState();
	}
	if (chipEngine) {
		chipEngine.reset();
	}
	if (applyRegisterState) {
		applyRegisterState();
	}
}
