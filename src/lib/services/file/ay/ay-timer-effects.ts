import {
	AY_REGISTER_COUNT,
	ENVELOPE_SHAPE_REGISTER,
	envelopePeriodRegisterApplyMask,
	envelopeShapeRegisterApplyMask,
	registerApplyMask,
	sidVolumeLevel,
	timerPwmStepPeriod,
	toneRegisterApplyMask,
	volumeRegisterIndex,
	writeEnvelopePeriodToPsgData,
	writeTonePeriodToPsgData,
	type HardwareEnvFmState,
	type HardwareFmState,
	type HardwareSidState,
	type HardwareSyncBuzzerState
} from './ay-export-utils';
import { computeEnvFmEnvelopePeriod, computeFmTonePeriod } from '../../../chips/ay/instrument';

export type StepRegisterWrite = { register: number; value: number };

export type TimerEffectStepSource = {
	registerMask: number;
	length: number;
	loop: number;
	writesAtStep(stepIndex: number): StepRegisterWrite[];
	stepPeriod(stepIndex: number): number;
};

export type MergedEffectStep = {
	writes: StepRegisterWrite[];
	registerMask: number;
	period: number;
	nextIndex: number;
};

type WaveformChainState = {
	waveform: number[];
	waveformLoop: number;
};

type PwmTimerState = WaveformChainState & {
	pwm: boolean;
	period: number;
	periodLow: number;
};

export function resolveNextWaveformIndex(stepIndex: number, state: WaveformChainState): number {
	const nextStep = stepIndex + 1;
	if (nextStep < state.waveform.length) {
		return nextStep;
	}
	if (state.waveformLoop >= 0 && state.waveformLoop < state.waveform.length) {
		return state.waveformLoop;
	}
	return 0;
}

export function previousWaveformStepIndex(stepIndex: number, state: WaveformChainState): number {
	if (stepIndex > 0) {
		return stepIndex - 1;
	}
	for (let index = state.waveform.length - 1; index >= 0; index--) {
		if (resolveNextWaveformIndex(index, state) === stepIndex) {
			return index;
		}
	}
	return state.waveform.length - 1;
}

export function normalizePwmPeriods<T extends PwmTimerState>(state: T): T {
	return {
		...state,
		periodLow: state.periodLow > 0 ? state.periodLow : state.period
	};
}

export function isPwmActive(state: PwmTimerState): boolean {
	const normalized = normalizePwmPeriods(state);
	return normalized.pwm || normalized.period !== normalized.periodLow;
}

export function pwmStepPeriod(state: PwmTimerState, stepIndex: number): number {
	const normalized = normalizePwmPeriods(state);
	if (isPwmActive(normalized) && normalized.waveform.length >= 2) {
		return stepIndex % 2 === 0 ? normalized.period : normalized.periodLow;
	}
	return normalized.period;
}

export function sidStepPeriod(sid: HardwareSidState, stepIndex: number): number {
	return timerPwmStepPeriod(sid.waveform[stepIndex] ?? 0, sid.period, sid.periodLow);
}

export function sidStartPeriod(sid: HardwareSidState): number {
	return timerPwmStepPeriod(sid.waveform[0] ?? 0, sid.period, sid.periodLow);
}

export function pwmStartPeriod(state: PwmTimerState): number {
	return pwmStepPeriod(state, 0);
}

export function sidStepSource(
	channelIndex: number,
	sid: HardwareSidState
): TimerEffectStepSource {
	const volumeReg = volumeRegisterIndex(channelIndex);
	return {
		registerMask: registerApplyMask(volumeReg),
		length: sid.waveform.length,
		loop: sid.waveformLoop,
		writesAtStep: (stepIndex) => [
			{ register: volumeReg, value: sidVolumeLevel(sid.waveform[stepIndex]!, sid.baseVolume) }
		],
		stepPeriod: (stepIndex) => sidStepPeriod(sid, stepIndex)
	};
}

export function fmStepSource(channelIndex: number, fm: HardwareFmState): TimerEffectStepSource {
	const toneReg = channelIndex * 2;
	return {
		registerMask: toneRegisterApplyMask(channelIndex),
		length: fm.waveform.length,
		loop: fm.waveformLoop,
		writesAtStep: (stepIndex) => {
			const psgData = new Array(AY_REGISTER_COUNT).fill(0);
			const tonePeriod = computeFmTonePeriod(
				fm.baseTonePeriod,
				fm.waveform[stepIndex]!,
				fm.fmOffsetMode
			);
			writeTonePeriodToPsgData(psgData, channelIndex, tonePeriod);
			return [
				{ register: toneReg, value: psgData[toneReg]! },
				{ register: toneReg + 1, value: psgData[toneReg + 1]! }
			];
		},
		stepPeriod: (stepIndex) => pwmStepPeriod(fm, stepIndex)
	};
}

export function envFmStepSource(envFm: HardwareEnvFmState): TimerEffectStepSource {
	return {
		registerMask: envelopePeriodRegisterApplyMask(),
		length: envFm.waveform.length,
		loop: envFm.waveformLoop,
		writesAtStep: (stepIndex) => {
			const psgData = new Array(AY_REGISTER_COUNT).fill(0);
			const envelopePeriod = computeEnvFmEnvelopePeriod(
				envFm.baseEnvelopePeriod,
				envFm.waveform[stepIndex]!,
				envFm.fmOffsetMode
			);
			writeEnvelopePeriodToPsgData(psgData, envelopePeriod);
			return [
				{ register: 11, value: psgData[11]! },
				{ register: 12, value: psgData[12]! }
			];
		},
		stepPeriod: (stepIndex) => pwmStepPeriod(envFm, stepIndex)
	};
}

export function syncBuzzerStepSource(
	syncbuzzer: HardwareSyncBuzzerState
): TimerEffectStepSource {
	return {
		registerMask: envelopeShapeRegisterApplyMask(),
		length: syncbuzzer.waveform.length,
		loop: syncbuzzer.waveformLoop,
		writesAtStep: (stepIndex) => [
			{ register: ENVELOPE_SHAPE_REGISTER, value: (syncbuzzer.waveform[stepIndex] ?? 0) & 0xf }
		],
		stepPeriod: (stepIndex) => pwmStepPeriod(syncbuzzer, stepIndex)
	};
}

function sourceNextStepIndex(stepIndex: number, source: TimerEffectStepSource): number {
	return resolveNextWaveformIndex(stepIndex, {
		waveform: new Array(source.length),
		waveformLoop: source.loop
	});
}

export function buildMergedEffectSteps(sources: TimerEffectStepSource[]): MergedEffectStep[] {
	if (sources.length === 0 || sources.some((source) => source.length <= 0)) {
		return [];
	}

	const stepStates: number[][] = [];
	const indexByState = new Map<string, number>();
	let sourceSteps = sources.map(() => 0);
	let loopIndex = 0;

	while (true) {
		const key = sourceSteps.join(',');
		const existingIndex = indexByState.get(key);
		if (existingIndex !== undefined) {
			loopIndex = existingIndex;
			break;
		}
		indexByState.set(key, stepStates.length);
		stepStates.push([...sourceSteps]);
		sourceSteps = sourceSteps.map((sourceStep, sourceIndex) =>
			sourceNextStepIndex(sourceStep, sources[sourceIndex]!)
		);
	}

	return stepStates.map((states, stepIndex) => {
		const psgData = new Array<number>(AY_REGISTER_COUNT).fill(0);
		let registerMask = 0;
		let period = 0;
		for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
			const source = sources[sourceIndex]!;
			const sourceStep = states[sourceIndex]!;
			registerMask |= source.registerMask;
			for (const write of source.writesAtStep(sourceStep)) {
				psgData[write.register] = write.value;
			}
			const stepPeriod = source.stepPeriod(sourceStep);
			if (period === 0 && stepPeriod !== 0) {
				period = stepPeriod;
			}
		}
		const writes: StepRegisterWrite[] = [];
		for (let register = 0; register < AY_REGISTER_COUNT; register++) {
			if (registerMask & registerApplyMask(register)) {
				writes.push({ register, value: psgData[register]! });
			}
		}
		const nextIndex = stepIndex + 1 < stepStates.length ? stepIndex + 1 : loopIndex;
		return { writes, registerMask, period, nextIndex };
	});
}
