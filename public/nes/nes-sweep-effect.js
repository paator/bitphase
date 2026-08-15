import {
	buildSquareSweepReg,
	NES_SQUARE_SWEEP_DISABLED
} from './nes-instrument-utils.js';

export const NES_SWEEP_UP_SUBCOMMAND = 2;
export const NES_SWEEP_DOWN_SUBCOMMAND = 3;

export function isNesSweepUpEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_SWEEP_UP_SUBCOMMAND
	);
}

export function isNesSweepDownEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_SWEEP_DOWN_SUBCOMMAND
	);
}

export function isNesSweepEffect(effect) {
	return isNesSweepUpEffect(effect) || isNesSweepDownEffect(effect);
}

export function isNesSweepUpTableEffect(effect) {
	return (
		isNesSweepUpEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isNesSweepDownTableEffect(effect) {
	return (
		isNesSweepDownEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function parseNesSweepEffectParameter(parameter) {
	const rate = Math.min(7, (parameter >> 4) & 15);
	const shift = Math.min(7, parameter & 15);
	return { rate, shift };
}

function readNesSweepTableValue(state, tableIndex, position) {
	const table = state.getTable?.(tableIndex);
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;
	return rows[position] ?? 0;
}

function advanceNesSweepTablePosition(table, position) {
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;

	let nextPosition = position + 1;
	if (nextPosition >= rows.length) {
		const loop = table.loop;
		if (loop != null && loop >= 0 && loop < rows.length) {
			nextPosition = loop;
		} else {
			nextPosition = 0;
		}
	}
	return nextPosition;
}

function applyNesSweepOverrideFromParameter(state, channelIndex, parameter, sweepDown) {
	const { rate, shift } = parseNesSweepEffectParameter(parameter);
	if (shift === 0) {
		state.channelSweepOverrideReg[channelIndex] = NES_SQUARE_SWEEP_DISABLED;
	} else {
		const signedShift = sweepDown ? -shift : shift;
		state.channelSweepOverrideReg[channelIndex] = buildSquareSweepReg(true, rate, signedShift);
	}
}

function requestNesSweepHardwareRetrigger(state, channelIndex) {
	if (state.channelKeyOn) {
		state.channelKeyOn[channelIndex] = true;
	}
}

export function resetNesChannelSweepOverride(state, channelIndex) {
	state.channelSweepOverrideActive[channelIndex] = false;
	state.channelSweepOverrideReg[channelIndex] = NES_SQUARE_SWEEP_DISABLED;
	state.channelSweepTableMode[channelIndex] = false;
	state.channelSweepTableIndex[channelIndex] = -1;
	state.channelSweepTablePosition[channelIndex] = 0;
	state.channelSweepDown[channelIndex] = false;
	state.channelSweepTableTick[channelIndex] = false;
}

export function processNesSweepEffect(state, channelIndex, row) {
	const effects = row.effects;
	if (!effects) return;
	for (const effect of effects) {
		applyNesSweepEffect(state, channelIndex, effect);
	}
}

function applyNesSweepEffect(state, channelIndex, effect) {
	if (isNesSweepUpEffect(effect)) {
		if (isNesSweepUpTableEffect(effect)) {
			state.channelSweepOverrideActive[channelIndex] = true;
			state.channelSweepTableMode[channelIndex] = true;
			state.channelSweepDown[channelIndex] = false;
			state.channelSweepTableIndex[channelIndex] = effect.tableIndex;
			state.channelSweepTablePosition[channelIndex] = 0;
			applyNesSweepOverrideFromParameter(
				state,
				channelIndex,
				readNesSweepTableValue(state, effect.tableIndex, 0),
				false
			);
		} else {
			const { rate, shift } = parseNesSweepEffectParameter(effect.parameter);
			state.channelSweepTableMode[channelIndex] = false;
			state.channelSweepTableIndex[channelIndex] = -1;
			state.channelSweepTablePosition[channelIndex] = 0;
			state.channelSweepDown[channelIndex] = false;
			if (shift === 0) {
				resetNesChannelSweepOverride(state, channelIndex);
			} else {
				state.channelSweepOverrideActive[channelIndex] = true;
				state.channelSweepOverrideReg[channelIndex] = buildSquareSweepReg(true, rate, shift);
				requestNesSweepHardwareRetrigger(state, channelIndex);
			}
		}
		return;
	}
	if (isNesSweepDownEffect(effect)) {
		if (isNesSweepDownTableEffect(effect)) {
			state.channelSweepOverrideActive[channelIndex] = true;
			state.channelSweepTableMode[channelIndex] = true;
			state.channelSweepDown[channelIndex] = true;
			state.channelSweepTableIndex[channelIndex] = effect.tableIndex;
			state.channelSweepTablePosition[channelIndex] = 0;
			applyNesSweepOverrideFromParameter(
				state,
				channelIndex,
				readNesSweepTableValue(state, effect.tableIndex, 0),
				true
			);
		} else {
			const { rate, shift } = parseNesSweepEffectParameter(effect.parameter);
			state.channelSweepTableMode[channelIndex] = false;
			state.channelSweepTableIndex[channelIndex] = -1;
			state.channelSweepTablePosition[channelIndex] = 0;
			state.channelSweepDown[channelIndex] = true;
			if (shift === 0) {
				resetNesChannelSweepOverride(state, channelIndex);
			} else {
				state.channelSweepOverrideActive[channelIndex] = true;
				state.channelSweepOverrideReg[channelIndex] = buildSquareSweepReg(true, rate, -shift);
				requestNesSweepHardwareRetrigger(state, channelIndex);
			}
		}
		return;
	}
}

export function advanceNesSweepTable(state) {
	for (
		let channelIndex = 0;
		channelIndex < state.channelSweepTableMode.length;
		channelIndex++
	) {
		if (!state.channelSweepTableMode[channelIndex]) continue;

		const tableIndex = state.channelSweepTableIndex[channelIndex];
		const table = state.getTable?.(tableIndex);
		if (!table?.rows?.length) continue;

		const nextPosition = advanceNesSweepTablePosition(
			table,
			state.channelSweepTablePosition[channelIndex]
		);
		state.channelSweepTablePosition[channelIndex] = nextPosition;
		applyNesSweepOverrideFromParameter(
			state,
			channelIndex,
			readNesSweepTableValue(state, tableIndex, nextPosition),
			state.channelSweepDown[channelIndex]
		);
		state.channelSweepTableTick[channelIndex] = true;
	}
}
