import type { Mods, Taym } from './model';
import { poolFor } from './model';
import * as spec from './spec';

export class TaymValidationError extends Error {}

const PSG_MAGIC = [0x50, 0x53, 0x47, 0x1a];

export function validate(taym: Taym): string[] {
	const problems: string[] = [];
	validateTrak(taym, problems);
	validateChips(taym, problems);
	validateTimers(taym, problems);
	validateLanes(taym, problems);
	validateTlanes(taym, problems);
	validateActions(taym, problems);
	validateMods(taym, problems);
	validateFrameData(taym, problems);
	return problems;
}

export function check(taym: Taym): void {
	const problems = validate(taym);
	if (problems.length > 0) {
		throw new TaymValidationError(problems[0]);
	}
}

function validateTrak(taym: Taym, problems: string[]): void {
	const trak = taym.trak;
	if (trak.frameCount === 0) {
		problems.push('S4: TRAK.frame_count is zero');
	}
	if (!spec.fitsFix16(trak.frameRateHz) || spec.toFix16(trak.frameRateHz) === 0) {
		problems.push('S4: TRAK.frame_rate must be nonzero and fit unsigned 16.16');
	}
	if (trak.loopFrame !== spec.NO_LOOP && trak.loopFrame >= trak.frameCount) {
		problems.push(`S4: TRAK.loop_frame ${trak.loopFrame} >= frame_count ${trak.frameCount}`);
	}
	if (taym.mods.length !== trak.frameCount * taym.timers.length) {
		problems.push(
			`S4/S12: MODS has ${taym.mods.length} records, expected frame_count*timer_count = ${
				trak.frameCount * taym.timers.length
			}`
		);
	}
	if (taym.chips.length > 0xff) {
		problems.push('S4: chip_count exceeds u8');
	}
	if (taym.timers.length > 0xff) {
		problems.push('S4: timer_count exceeds u8');
	}
}

function validateChips(taym: Taym, problems: string[]): void {
	const seenTags = new Set<string>();
	const coreTags = new Set<string>([...spec.CORE_ONCE, 'INFO']);
	taym.chips.forEach((chip, index) => {
		if (chip.chipTypeId === spec.CHIP_TYPE_INVALID) {
			problems.push(`S6: CHIP[${index}] chip_type_id 0x00 is invalid`);
		}
		if (
			chip.chipTypeId === spec.CHIP_TYPE_AY &&
			chip.variant !== spec.AY_VARIANT_AY &&
			chip.variant !== spec.AY_VARIANT_YM
		) {
			problems.push(`A.1: CHIP[${index}] AY variant ${chip.variant} undefined (0=AY, 1=YM)`);
		}
		if (chip.chipTypeId === spec.CHIP_TYPE_AY) {
			const layout = spec.ayStereoLayout(chip.config);
			if (!spec.AY_LAYOUTS.includes(layout)) {
				problems.push(`A.1: CHIP[${index}] AY config stereo layout ${layout} undefined (0..6)`);
			}
			const reserved = chip.config & ~spec.AY_CFG_STEREO_MASK;
			if (reserved) {
				problems.push(
					`A.1: CHIP[${index}] AY config sets reserved bits 0x${(reserved >>> 0)
						.toString(16)
						.padStart(8, '0')
						.toUpperCase()}`
				);
			}
		}
		if (chip.frameDataTag) {
			if (seenTags.has(chip.frameDataTag)) {
				problems.push(`S6.1: repeated frame_data_tag ${chip.frameDataTag}`);
			}
			seenTags.add(chip.frameDataTag);
			if (coreTags.has(chip.frameDataTag)) {
				problems.push(`S6.1: frame_data_tag ${chip.frameDataTag} reuses a core/INFO tag`);
			}
		}
	});
}

function validateTimers(taym: Taym, problems: string[]): void {
	taym.timers.forEach((timer, index) => {
		if (!spec.CLOCK_MODES.includes(timer.clockMode)) {
			problems.push(`S7: TIMR[${index}] clock_mode ${timer.clockMode} invalid`);
			return;
		}
		if (timer.chipIndex >= taym.chips.length) {
			problems.push(`S7: TIMR[${index}] chip_index ${timer.chipIndex} out of range`);
			return;
		}
		if (timer.clockMode === spec.CLOCK_ABS_RATE_HZ) {
			if (timer.clockDivider !== 0) {
				problems.push(`S7: TIMR[${index}] ABS_RATE_HZ requires clock_divider==0`);
			}
		} else {
			if (timer.clockDivider === 0) {
				problems.push(`S7: TIMR[${index}] CHIP_PERIOD requires nonzero clock_divider`);
			}
			if (taym.chips[timer.chipIndex].clockHz === 0) {
				problems.push(`S7: TIMR[${index}] CHIP_PERIOD chip has zero clock_hz`);
			}
		}
	});
}

function validateLanes(taym: Taym, problems: string[]): void {
	taym.lanes.forEach((lane, index) => {
		if (!spec.VALUE_TYPES.includes(lane.valueType)) {
			problems.push(`S9: LANE[${index}] value_type ${lane.valueType} invalid`);
			return;
		}
		if (lane.length === 0) {
			problems.push(`S9: LANE[${index}] zero length`);
			return;
		}
		const pool = poolFor(taym, lane.valueType);
		if (lane.valueOffset + lane.length > pool.length) {
			problems.push(
				`S9: LANE[${index}] slice [${lane.valueOffset},+${lane.length}] outside ${
					spec.VALUE_TYPE_POOL[lane.valueType].tag
				} (len ${pool.length})`
			);
		}
		if (lane.loopIndex !== spec.NO_LOOP && lane.loopIndex >= lane.length) {
			problems.push(`S9: LANE[${index}] loop_index ${lane.loopIndex} >= length ${lane.length}`);
		}
	});
}

function validateTlanes(taym: Taym, problems: string[]): void {
	taym.tlanes.forEach((tlan, index) => {
		if (!spec.TIMING_MODES.includes(tlan.timingMode)) {
			problems.push(`S10: TLAN[${index}] timing_mode ${tlan.timingMode} invalid`);
		}
		if (tlan.length === 0) {
			problems.push(`S10: TLAN[${index}] zero length`);
			return;
		}
		if (tlan.valueOffset + tlan.length > taym.vu32.length) {
			problems.push(
				`S10: TLAN[${index}] slice [${tlan.valueOffset},+${tlan.length}] outside VU32 (len ${taym.vu32.length})`
			);
		}
		if (tlan.loopIndex !== spec.NO_LOOP && tlan.loopIndex >= tlan.length) {
			problems.push(`S10: TLAN[${index}] loop_index ${tlan.loopIndex} >= length ${tlan.length}`);
		}
	});
}

function isFmtVirtualTarget(targetId: number): boolean {
	return targetId >= 0x80 && targetId <= 0xbf;
}

function isDefinedFmtVirtualTarget(targetId: number): boolean {
	return (
		targetId === spec.TGT_SAMPLE_AMPLITUDE ||
		targetId === spec.TGT_SAMPLE_INDEX ||
		targetId === spec.TGT_SAMPLE_RATE
	);
}

function validTarget(targetId: number): boolean {
	if (isFmtVirtualTarget(targetId)) {
		return isDefinedFmtVirtualTarget(targetId);
	}
	return true;
}

function ayTargetOk(targetId: number): boolean {
	if (targetId <= spec.AY_TARGET_MAX) {
		return true;
	}
	if (targetId <= 0x7f) {
		return false;
	}
	if (isDefinedFmtVirtualTarget(targetId)) {
		return true;
	}
	if (isFmtVirtualTarget(targetId)) {
		return false;
	}
	return targetId >= 0xc0 && targetId <= 0xff;
}

function validateActions(taym: Taym, problems: string[]): void {
	taym.actions.forEach((action, index) => {
		if (!spec.SOURCE_MODES.includes(action.sourceMode)) {
			problems.push(`S11: ACTN[${index}] source_mode ${action.sourceMode} invalid`);
		}
		if (!validTarget(action.targetId)) {
			problems.push(
				`S11: ACTN[${index}] target_id 0x${action.targetId.toString(16)} is reserved/invalid`
			);
		}
		if (action.sourceMode === spec.SRC_BIND_LANE && action.operand >= taym.lanes.length) {
			problems.push(`S11: ACTN[${index}] BIND_LANE operand ${action.operand} out of LANE range`);
		}
	});
}

function actionSlice(taym: Taym, mods: Mods): typeof taym.actions {
	return taym.actions.slice(mods.firstAction, mods.firstAction + mods.actionCount);
}

function checkActionsSlice(
	taym: Taym,
	mods: Mods,
	frame: number,
	timerIndex: number,
	problems: string[]
): void {
	if (mods.actionCount === 0) {
		return;
	}
	if (mods.firstAction + mods.actionCount > taym.actions.length) {
		problems.push(
			`S12: MODS frame ${frame} timer ${timerIndex} action slice [${mods.firstAction},+${mods.actionCount}] out of ACTN range`
		);
		return;
	}
	const timer = taym.timers[timerIndex];
	const chipType =
		timer && timer.chipIndex < taym.chips.length
			? taym.chips[timer.chipIndex].chipTypeId
			: undefined;
	let prev = -1;
	for (const action of actionSlice(taym, mods)) {
		if (action.targetId <= prev) {
			problems.push(
				`S11: MODS frame ${frame} timer ${timerIndex} action slice not strictly sorted / duplicate target 0x${action.targetId.toString(
					16
				)}`
			);
		}
		prev = action.targetId;
		if (chipType === spec.CHIP_TYPE_AY && !ayTargetOk(action.targetId)) {
			problems.push(
				`AppA: MODS frame ${frame} timer ${timerIndex} target 0x${action.targetId.toString(
					16
				)} invalid for AY chip`
			);
		}
		if (action.sourceMode === spec.SRC_BIND_LANE && action.operand < taym.lanes.length) {
			const lane = taym.lanes[action.operand];
			if (
				chipType === spec.CHIP_TYPE_AY &&
				action.targetId <= spec.AY_TARGET_MAX &&
				lane.valueType !== spec.VT_U8
			) {
				problems.push(
					`S9/AppA: MODS frame ${frame} timer ${timerIndex} AY reg 0x${action.targetId.toString(
						16
					)} bound to non-U8 lane`
				);
			}
		}
	}
}

function checkStart(
	taym: Taym,
	mods: Mods,
	frame: number,
	timerIndex: number,
	problems: string[]
): void {
	if (mods.baseTimerValue === 0) {
		problems.push(`S12.2: MODS frame ${frame} timer ${timerIndex} START base_timer_value is zero`);
	}
	if (mods.timerLaneRef === spec.TLAN_UNCHANGED) {
		problems.push(
			`S12.2: MODS frame ${frame} timer ${timerIndex} START timer_lane_ref UNCHANGED invalid`
		);
	} else if (mods.timerLaneRef !== spec.TLAN_NONE && mods.timerLaneRef >= taym.tlanes.length) {
		problems.push(
			`S12.2: MODS frame ${frame} timer ${timerIndex} timer_lane_ref ${mods.timerLaneRef} out of TLAN range`
		);
	}
	if (mods.actionCount < 1) {
		problems.push(`S12.2: MODS frame ${frame} timer ${timerIndex} START with no actions`);
	}
	checkActionsSlice(taym, mods, frame, timerIndex, problems);
}

function validateMods(taym: Taym, problems: string[]): void {
	const timerCount = taym.timers.length;
	if (timerCount === 0) {
		return;
	}
	if (taym.mods.length !== taym.trak.frameCount * timerCount) {
		return;
	}
	const active: Array<'active' | null> = new Array(timerCount).fill(null);

	for (let frame = 0; frame < taym.trak.frameCount; frame++) {
		const startsThisFrame = new Map<string, number>();
		for (let timerIndex = 0; timerIndex < timerCount; timerIndex++) {
			const mods = taym.mods[frame * timerCount + timerIndex];
			const command = mods.command;
			if (!spec.COMMANDS.includes(command)) {
				problems.push(`S12: MODS frame ${frame} timer ${timerIndex} command ${command} invalid`);
				continue;
			}
			if (command === spec.CMD_START) {
				checkStart(taym, mods, frame, timerIndex, problems);
				active[timerIndex] = 'active';
				const chip = taym.timers[timerIndex].chipIndex;
				for (const action of actionSlice(taym, mods)) {
					const key = `${chip}:${action.targetId}`;
					if (startsThisFrame.has(key)) {
						problems.push(
							`S13.2: frame ${frame} two STARTs claim chip ${chip} target 0x${action.targetId.toString(
								16
							)}`
						);
					}
					startsThisFrame.set(key, timerIndex);
				}
			} else if (command === spec.CMD_MODULATE) {
				if (active[timerIndex] !== 'active') {
					problems.push(
						`S12.3: MODS frame ${frame} timer ${timerIndex} MODULATE on inactive timer`
					);
				}
				if (
					mods.timerLaneRef !== spec.TLAN_NONE &&
					mods.timerLaneRef !== spec.TLAN_UNCHANGED &&
					mods.timerLaneRef >= taym.tlanes.length
				) {
					problems.push(
						`S12: MODS frame ${frame} timer ${timerIndex} timer_lane_ref ${mods.timerLaneRef} out of TLAN range`
					);
				}
				checkActionsSlice(taym, mods, frame, timerIndex, problems);
			} else if (command === spec.CMD_STOP) {
				active[timerIndex] = null;
			}
		}
	}

	const loopFrame = taym.trak.loopFrame;
	if (
		loopFrame !== spec.NO_LOOP &&
		loopFrame < taym.trak.frameCount &&
		loopFrame * timerCount + timerCount <= taym.mods.length
	) {
		for (let timerIndex = 0; timerIndex < timerCount; timerIndex++) {
			const mods = taym.mods[loopFrame * timerCount + timerIndex];
			if (mods.command !== spec.CMD_START && mods.command !== spec.CMD_STOP) {
				problems.push(
					`S4: timer ${timerIndex} at loop_frame ${loopFrame} is neither START nor STOP`
				);
			}
		}
	}
}

function validateFrameData(taym: Taym, problems: string[]): void {
	taym.chips.forEach((chip, index) => {
		if (!chip.frameDataTag) {
			return;
		}
		const payload = taym.frameData[chip.frameDataTag];
		if (payload === undefined) {
			problems.push(`S6.2: CHIP[${index}] frame data ${chip.frameDataTag} missing payload`);
			return;
		}
		if (chip.chipTypeId === spec.CHIP_TYPE_AY) {
			const headerOk =
				payload.length >= 4 && PSG_MAGIC.every((byte, offset) => payload[offset] === byte);
			if (!headerOk) {
				problems.push(`S6.2: CHIP[${index}] frame data ${chip.frameDataTag} lacks PSG header`);
			}
		}
	});
}
