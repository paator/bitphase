import {
	AY_TIMER_PWM_DUTY_MAX,
	AY_TIMER_PWM_SWEEP_SHAPES,
	AY_TIMER_PWM_SWEEP_START_PHASE_MAX,
	clampTimerPwmDuty,
	clampTimerPwmSweep,
	clampTimerPwmSweepMin,
	clampTimerPwmSweepStartPhase,
	DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE,
	resolveTimerPwmSweepShape
} from './ay-instrument-utils.js';

export const AY_TIMER_PWM_MIN_SUBCOMMAND = 1;
export const AY_TIMER_PWM_MAX_SUBCOMMAND = 2;
export const AY_TIMER_PWM_SWEEP_SUBCOMMAND = 3;
export const AY_TIMER_PWM_SHAPE_SUBCOMMAND = 4;
export const AY_TIMER_PWM_START_SUBCOMMAND = 5;
export const AY_AUTO_ENVELOPE_SUBCOMMAND = 0xa;
export const AY_TIMER_PWM_OVERRIDE_INACTIVE = -1;
export const AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE = null;
export const AY_TIMER_PWM_TABLE_SLOT_COUNT = 5;

export function isAyTimerPwmMinEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_MIN_SUBCOMMAND
	);
}

export function isAyTimerPwmMaxEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_MAX_SUBCOMMAND
	);
}

export function isAyTimerPwmSweepEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_SWEEP_SUBCOMMAND
	);
}

export function isAyTimerPwmShapeEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_SHAPE_SUBCOMMAND
	);
}

export function isAyTimerPwmStartEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_START_SUBCOMMAND
	);
}

export function isAyTimerPwmEffect(effect) {
	return (
		isAyTimerPwmMinEffect(effect) ||
		isAyTimerPwmMaxEffect(effect) ||
		isAyTimerPwmSweepEffect(effect) ||
		isAyTimerPwmShapeEffect(effect) ||
		isAyTimerPwmStartEffect(effect)
	);
}

export function isAyTimerPwmTableEffect(effect) {
	return (
		isAyTimerPwmEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isAyAutoEnvelopeEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_AUTO_ENVELOPE_SUBCOMMAND
	);
}

export function mapHexParameterToTimerPwmPercent(parameter) {
	return Math.round(((parameter & 0xff) * AY_TIMER_PWM_DUTY_MAX) / 255);
}

export function mapTimerPwmPercentToHexParameter(percent) {
	const clamped = Math.max(0, Math.min(AY_TIMER_PWM_DUTY_MAX, Math.round(percent)));
	return Math.round((clamped * 255) / AY_TIMER_PWM_DUTY_MAX) & 0xff;
}

export function mapHexParameterToTimerPwmSweepShape(parameter) {
	const shapes = AY_TIMER_PWM_SWEEP_SHAPES;
	const index = (parameter & 0xff) % shapes.length;
	return shapes[index] ?? DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE;
}

export function mapHexParameterToTimerPwmSweepStartPhase(parameter) {
	return clampTimerPwmSweepStartPhase(
		Math.round(((parameter & 0xff) * AY_TIMER_PWM_SWEEP_START_PHASE_MAX) / 255)
	);
}

function createTableIndexRow() {
	return Array.from({ length: AY_TIMER_PWM_TABLE_SLOT_COUNT }, () => -1);
}

function createTablePositionRow() {
	return Array.from({ length: AY_TIMER_PWM_TABLE_SLOT_COUNT }, () => 0);
}

export function createAyTimerPwmTableIndex(channelCount) {
	return Array.from({ length: channelCount }, () => createTableIndexRow());
}

export function createAyTimerPwmTablePosition(channelCount) {
	return Array.from({ length: channelCount }, () => createTablePositionRow());
}

export function resizeAyTimerPwmTableState(state, newCount) {
	if (!state.channelTimerPwmTableIndex || !state.channelTimerPwmTablePosition) {
		state.channelTimerPwmTableIndex = createAyTimerPwmTableIndex(newCount);
		state.channelTimerPwmTablePosition = createAyTimerPwmTablePosition(newCount);
		return;
	}
	while (state.channelTimerPwmTableIndex.length < newCount) {
		state.channelTimerPwmTableIndex.push(createTableIndexRow());
		state.channelTimerPwmTablePosition.push(createTablePositionRow());
	}
	if (state.channelTimerPwmTableIndex.length > newCount) {
		state.channelTimerPwmTableIndex.length = newCount;
		state.channelTimerPwmTablePosition.length = newCount;
	}
}

export function resetAyTimerPwmTableState(state) {
	if (!state.channelTimerPwmTableIndex || !state.channelTimerPwmTablePosition) return;
	for (let index = 0; index < state.channelTimerPwmTableIndex.length; index++) {
		state.channelTimerPwmTableIndex[index].fill(-1);
		state.channelTimerPwmTablePosition[index].fill(0);
	}
}

function ensureTimerPwmTableChannel(state, channelIndex) {
	const needed = Math.max(channelIndex + 1, state.channelTimerPwmTableIndex?.length ?? 0);
	resizeAyTimerPwmTableState(state, needed);
}

function timerPwmTableSlot(effect) {
	return effect.delay - AY_TIMER_PWM_MIN_SUBCOMMAND;
}

function readAyTimerPwmTableValue(state, tableIndex, position) {
	const table = state.getTable?.(tableIndex);
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;
	return rows[position] ?? 0;
}

function advanceAyTimerPwmTablePosition(table, position) {
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

function applyAyTimerPwmParameter(state, channelIndex, subcommand, parameter) {
	if (subcommand === AY_TIMER_PWM_MIN_SUBCOMMAND) {
		state.channelTimerPwmSweepMinOverride[channelIndex] = clampTimerPwmDuty(
			mapHexParameterToTimerPwmPercent(parameter)
		);
		return;
	}
	if (subcommand === AY_TIMER_PWM_MAX_SUBCOMMAND) {
		state.channelTimerPwmDutyOverride[channelIndex] = clampTimerPwmDuty(
			mapHexParameterToTimerPwmPercent(parameter)
		);
		return;
	}
	if (subcommand === AY_TIMER_PWM_SWEEP_SUBCOMMAND) {
		state.channelTimerPwmSweepOverride[channelIndex] = clampTimerPwmSweep(
			mapHexParameterToTimerPwmPercent(parameter)
		);
		return;
	}
	if (subcommand === AY_TIMER_PWM_SHAPE_SUBCOMMAND) {
		state.channelTimerPwmSweepShapeOverride[channelIndex] = mapHexParameterToTimerPwmSweepShape(
			parameter
		);
		return;
	}

	const startPhase = mapHexParameterToTimerPwmSweepStartPhase(parameter);
	state.channelTimerPwmSweepStartPhaseOverride[channelIndex] = startPhase;
	if (state.channelTimerPwmSweep) {
		state.channelTimerPwmSweep[channelIndex] = startPhase;
	}
}

function clearTimerPwmTableSlot(state, channelIndex, slot) {
	if (!state.channelTimerPwmTableIndex?.[channelIndex]) return;
	state.channelTimerPwmTableIndex[channelIndex][slot] = -1;
	state.channelTimerPwmTablePosition[channelIndex][slot] = 0;
}

export function resetAyChannelTimerPwmOverrides(state, channelIndex) {
	if (!state.channelTimerPwmDutyOverride) return;
	state.channelTimerPwmDutyOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	state.channelTimerPwmSweepMinOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	state.channelTimerPwmSweepOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	if (state.channelTimerPwmSweepShapeOverride) {
		state.channelTimerPwmSweepShapeOverride[channelIndex] = AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE;
	}
	if (state.channelTimerPwmSweepStartPhaseOverride) {
		state.channelTimerPwmSweepStartPhaseOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	}
	if (state.channelTimerPwmTableIndex?.[channelIndex]) {
		state.channelTimerPwmTableIndex[channelIndex].fill(-1);
		state.channelTimerPwmTablePosition[channelIndex].fill(0);
	}
}

export function processAyTimerPwmEffect(state, channelIndex, row) {
	const effects = row.effects;
	if (!effects) return;
	for (const effect of effects) {
		if (!isAyTimerPwmEffect(effect)) continue;
		applyAyTimerPwmEffect(state, channelIndex, effect);
	}
}

function applyAyTimerPwmEffect(state, channelIndex, effect) {
	const slot = timerPwmTableSlot(effect);
	if (isAyTimerPwmTableEffect(effect)) {
		ensureTimerPwmTableChannel(state, channelIndex);
		state.channelTimerPwmTableIndex[channelIndex][slot] = effect.tableIndex;
		state.channelTimerPwmTablePosition[channelIndex][slot] = 0;
		applyAyTimerPwmParameter(
			state,
			channelIndex,
			effect.delay,
			readAyTimerPwmTableValue(state, effect.tableIndex, 0)
		);
		return;
	}

	clearTimerPwmTableSlot(state, channelIndex, slot);
	applyAyTimerPwmParameter(state, channelIndex, effect.delay, effect.parameter);
}

export function advanceAyTimerPwmTables(state) {
	const tableIndexes = state.channelTimerPwmTableIndex;
	if (!tableIndexes) return;

	for (let channelIndex = 0; channelIndex < tableIndexes.length; channelIndex++) {
		const slots = tableIndexes[channelIndex];
		if (!slots) continue;

		for (let slot = 0; slot < slots.length; slot++) {
			const tableIndex = slots[slot];
			if (tableIndex < 0) continue;

			const table = state.getTable?.(tableIndex);
			if (!table?.rows?.length) continue;

			const nextPosition = advanceAyTimerPwmTablePosition(
				table,
				state.channelTimerPwmTablePosition[channelIndex][slot]
			);
			state.channelTimerPwmTablePosition[channelIndex][slot] = nextPosition;
			applyAyTimerPwmParameter(
				state,
				channelIndex,
				slot + AY_TIMER_PWM_MIN_SUBCOMMAND,
				readAyTimerPwmTableValue(state, tableIndex, nextPosition)
			);
		}
	}
}

export function resolveChannelTimerPwmDuty(state, channelIndex, instrumentDuty) {
	const override = state.channelTimerPwmDutyOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmDuty(instrumentDuty);
	}
	return clampTimerPwmDuty(override);
}

export function resolveChannelTimerPwmSweep(state, channelIndex, instrumentSweep) {
	const override = state.channelTimerPwmSweepOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmSweep(instrumentSweep);
	}
	return clampTimerPwmSweep(override);
}

export function resolveChannelTimerPwmSweepMin(state, channelIndex, instrumentMin, maxDuty) {
	const override = state.channelTimerPwmSweepMinOverride?.[channelIndex];
	const min =
		override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE
			? instrumentMin
			: override;
	return clampTimerPwmSweepMin(min, maxDuty);
}

export function resolveChannelTimerPwmSweepShape(state, channelIndex, instrumentShape) {
	const override = state.channelTimerPwmSweepShapeOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE) {
		return resolveTimerPwmSweepShape(instrumentShape);
	}
	return resolveTimerPwmSweepShape(override);
}

export function resolveChannelTimerPwmSweepStartPhase(state, channelIndex, instrumentPhase) {
	const override = state.channelTimerPwmSweepStartPhaseOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmSweepStartPhase(instrumentPhase);
	}
	return clampTimerPwmSweepStartPhase(override);
}
