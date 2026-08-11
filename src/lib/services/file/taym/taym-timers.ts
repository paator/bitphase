import {
	TAYM_FIXED_POINT_SCALE,
	TaymClockMode,
	TaymCommand,
	TaymSourceMode,
	TaymTimingMode
} from './taym-spec';
import type { TaymFile, TaymValueLane } from './taym-types';

export type TaymBinding = {
	targetId: number;
	lane: TaymValueLane | null;
	inlineValue: number;
};

export type TaymTimerSegment = {
	timerIndex: number;
	chipIndex: number;
	startFrame: number;
	endFrame: number;
	retrigger: boolean;
	bindings: TaymBinding[];
	rateHz: number;
	intervalRatesHz: number[];
};

export type TaymTimerTimeline = {
	segments: TaymTimerSegment[];
	warnings: string[];
};

type TimerRuntime = {
	active: boolean;
	base: number;
	timerLaneIndex: number | null;
	bindings: Map<number, TaymBinding>;
	segment: TaymTimerSegment | null;
};

export function resolveTimerTimeline(file: TaymFile): TaymTimerTimeline {
	const { track, timers, mods, actions, lanes, timerLanes, chips } = file;
	const warnings: string[] = [];
	const segments: TaymTimerSegment[] = [];
	const runtimes: TimerRuntime[] = timers.map(() => ({
		active: false,
		base: 0,
		timerLaneIndex: null,
		bindings: new Map(),
		segment: null
	}));
	const owners = new Map<string, number>();
	const laneClockModes = new Map<number, TaymClockMode>();

	const closeSegment = (runtime: TimerRuntime, frame: number) => {
		if (!runtime.segment) return;
		runtime.segment.endFrame = frame;
		if (runtime.segment.endFrame > runtime.segment.startFrame) {
			segments.push(runtime.segment);
		}
		runtime.segment = null;
	};

	const openSegment = (timerIndex: number, frame: number, retrigger: boolean) => {
		const runtime = runtimes[timerIndex]!;
		const timer = timers[timerIndex]!;
		const rates = resolveIntervalRates(
			runtime.base,
			runtime.timerLaneIndex === null ? null : (timerLanes[runtime.timerLaneIndex] ?? null),
			timer.clockMode,
			timer.clockDivider,
			chips[timer.chipIndex]?.clockHz ?? 0
		);
		runtime.segment = {
			timerIndex,
			chipIndex: timer.chipIndex,
			startFrame: frame,
			endFrame: track.frameCount,
			retrigger,
			bindings: [...runtime.bindings.values()].sort((a, b) => a.targetId - b.targetId),
			rateHz: rates[0] ?? 0,
			intervalRatesHz: rates
		};
	};

	const releaseTargets = (timerIndex: number) => {
		const runtime = runtimes[timerIndex]!;
		const chipIndex = timers[timerIndex]!.chipIndex;
		for (const targetId of runtime.bindings.keys()) {
			const key = ownerKey(chipIndex, targetId);
			if (owners.get(key) === timerIndex) {
				owners.delete(key);
			}
		}
	};

	for (let frame = 0; frame < track.frameCount; frame++) {
		const frameBase = frame * track.timerCount;

		for (let timerIndex = 0; timerIndex < track.timerCount; timerIndex++) {
			const command = mods[frameBase + timerIndex]!.command;
			if (command === TaymCommand.Stop || command === TaymCommand.Start) {
				releaseTargets(timerIndex);
			}
		}

		for (let timerIndex = 0; timerIndex < track.timerCount; timerIndex++) {
			const mod = mods[frameBase + timerIndex]!;
			const runtime = runtimes[timerIndex]!;
			if (mod.command === TaymCommand.Stop) {
				closeSegment(runtime, frame);
				runtime.active = false;
				runtime.bindings.clear();
				continue;
			}
			if (mod.command !== TaymCommand.Start) {
				continue;
			}

			closeSegment(runtime, frame);
			runtime.active = true;
			runtime.base = mod.baseTimerValue;
			runtime.timerLaneIndex = typeof mod.timerLaneRef === 'number' ? mod.timerLaneRef : null;
			runtime.bindings = new Map();

			for (let offset = 0; offset < mod.actionCount; offset++) {
				const action = actions[mod.firstAction + offset]!;
				const binding = toBinding(action, lanes);
				runtime.bindings.set(action.targetId, binding);
				const key = ownerKey(timers[timerIndex]!.chipIndex, action.targetId);
				const currentOwner = owners.get(key);
				if (currentOwner !== undefined && currentOwner !== timerIndex) {
					warnings.push(
						`Frame ${frame}: timers ${currentOwner} and ${timerIndex} both claim target 0x${action.targetId
							.toString(16)
							.padStart(2, '0')}`
					);
				}
				owners.set(key, timerIndex);
			}

			noteLaneClockMode(
				runtime.timerLaneIndex,
				timers[timerIndex]!.clockMode,
				timerLanes,
				laneClockModes,
				warnings
			);
			openSegment(timerIndex, frame, true);
		}

		for (let timerIndex = 0; timerIndex < track.timerCount; timerIndex++) {
			const mod = mods[frameBase + timerIndex]!;
			if (mod.command !== TaymCommand.Modulate) {
				continue;
			}
			const runtime = runtimes[timerIndex]!;
			if (!runtime.active) {
				warnings.push(`Frame ${frame}: MODULATE on inactive timer ${timerIndex} ignored`);
				continue;
			}

			if (mod.baseTimerValue !== 0) {
				runtime.base = mod.baseTimerValue;
			}
			if (mod.timerLaneRef !== 'unchanged') {
				const nextLaneIndex =
					typeof mod.timerLaneRef === 'number' ? mod.timerLaneRef : null;
				warnIfPhaseIncompatible(
					runtime.timerLaneIndex === null
						? null
						: (timerLanes[runtime.timerLaneIndex] ?? null),
					nextLaneIndex === null ? null : (timerLanes[nextLaneIndex] ?? null),
					frame,
					timerIndex,
					warnings
				);
				runtime.timerLaneIndex = nextLaneIndex;
				noteLaneClockMode(
					nextLaneIndex,
					timers[timerIndex]!.clockMode,
					timerLanes,
					laneClockModes,
					warnings
				);
			}

			for (let offset = 0; offset < mod.actionCount; offset++) {
				const action = actions[mod.firstAction + offset]!;
				const existing = runtime.bindings.get(action.targetId);
				if (!existing) {
					warnings.push(
						`Frame ${frame}: timer ${timerIndex} modulates unowned target 0x${action.targetId
							.toString(16)
							.padStart(2, '0')}`
					);
					continue;
				}
				const binding = toBinding(action, lanes);
				if (existing.lane && binding.lane) {
					warnIfPhaseIncompatible(
						existing.lane,
						binding.lane,
						frame,
						timerIndex,
						warnings
					);
				}
				runtime.bindings.set(action.targetId, binding);
			}

			closeSegment(runtime, frame);
			openSegment(timerIndex, frame, false);
		}
	}

	for (let timerIndex = 0; timerIndex < track.timerCount; timerIndex++) {
		closeSegment(runtimes[timerIndex]!, track.frameCount);
	}

	if (track.loopFrame !== null) {
		const frameBase = track.loopFrame * track.timerCount;
		for (let timerIndex = 0; timerIndex < track.timerCount; timerIndex++) {
			const command = mods[frameBase + timerIndex]!.command;
			if (command !== TaymCommand.Start && command !== TaymCommand.Stop) {
				warnings.push(
					`Loop frame ${track.loopFrame}: timer ${timerIndex} is neither started nor stopped`
				);
			}
		}
	}

	segments.sort((a, b) => a.startFrame - b.startFrame || a.timerIndex - b.timerIndex);
	return { segments, warnings };
}

function toBinding(
	action: { operand: number; targetId: number; sourceMode: number },
	lanes: TaymValueLane[]
): TaymBinding {
	if (action.sourceMode === TaymSourceMode.BindLane) {
		return {
			targetId: action.targetId,
			lane: lanes[action.operand] ?? null,
			inlineValue: 0
		};
	}
	return { targetId: action.targetId, lane: null, inlineValue: action.operand };
}

function ownerKey(chipIndex: number, targetId: number): string {
	return `${chipIndex}:${targetId}`;
}

function noteLaneClockMode(
	laneIndex: number | null,
	clockMode: TaymClockMode,
	timerLanes: TaymFile['timerLanes'],
	laneClockModes: Map<number, TaymClockMode>,
	warnings: string[]
): void {
	if (laneIndex === null) return;
	const lane = timerLanes[laneIndex];
	if (!lane || lane.timingMode !== TaymTimingMode.Absolute) return;
	const known = laneClockModes.get(laneIndex);
	if (known !== undefined && known !== clockMode) {
		warnings.push(`Absolute timer lane ${laneIndex} is shared across different clock modes`);
		return;
	}
	laneClockModes.set(laneIndex, clockMode);
}

function warnIfPhaseIncompatible(
	previous: { length: number; loopIndex: number | null } | null,
	next: { length: number; loopIndex: number | null } | null,
	frame: number,
	timerIndex: number,
	warnings: string[]
): void {
	if (!previous || !next) return;
	if (previous.length === next.length && previous.loopIndex === next.loopIndex) return;
	warnings.push(
		`Frame ${frame}: timer ${timerIndex} replaces a lane with a different length or loop point`
	);
}

function resolveIntervalRates(
	base: number,
	timerLane: { values: number[]; timingMode: TaymTimingMode } | null,
	clockMode: TaymClockMode,
	clockDivider: number,
	chipClockHz: number
): number[] {
	const baseRate = toRateHz(base, clockMode, clockDivider, chipClockHz);
	if (!timerLane) {
		return [baseRate];
	}
	if (timerLane.timingMode === TaymTimingMode.Relative) {
		return timerLane.values.map(
			(multiplier) => baseRate * (multiplier / TAYM_FIXED_POINT_SCALE)
		);
	}
	return timerLane.values.map((value) => toRateHz(value, clockMode, clockDivider, chipClockHz));
}

function toRateHz(
	value: number,
	clockMode: TaymClockMode,
	clockDivider: number,
	chipClockHz: number
): number {
	if (value <= 0) {
		return 0;
	}
	if (clockMode === TaymClockMode.AbsRateHz) {
		return value / TAYM_FIXED_POINT_SCALE;
	}
	if (clockDivider === 0 || chipClockHz === 0) {
		return 0;
	}
	return chipClockHz / (clockDivider * value);
}
