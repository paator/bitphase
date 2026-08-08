export const TMR_FRAME_SIZE = 20;
export const TMR_ITEM_SIZE = 22;
export const TMR_HEADER_SIZE = 32;
export const TMR_TIMER_EVENT_STOP = 0xffff;
export const TMR_PSG_MASK_TIMER_BITS = 0x0003;
export const TMR_TIMER_FREQUENCY_SCALE = 65536;

export type TmrEventItemRecord = {
	psgData: number[];
	psgMask: number;
	timerFrequency: number;
	timerEventIndex: number;
};

export function encodeTimerFrequencyHz(hz: number): number {
	if (hz <= 0) {
		return 0;
	}
	return Math.round(hz * TMR_TIMER_FREQUENCY_SCALE) >>> 0;
}

export function decodeTimerFrequencyHz(stored: number): number {
	if (stored === 0) {
		return 0;
	}
	return stored / TMR_TIMER_FREQUENCY_SCALE;
}

export const YM_SID_TONE_PERIOD_DIVISOR = 16;
export const TMR_EXPORT_TIMER_FREQUENCY_TONE_MULTIPLIER = 2;

export function timerPeriodTicksToFrequencyHz(psgClockHz: number, periodTicks: number): number {
	return psgClockHz / Math.max(1, periodTicks);
}

export function ymSidToneFrequencyHz(psgClockHz: number, ymPeriod: number): number {
	const period = ymPeriod & 0xffff;
	if (period <= 0 || psgClockHz <= 0) {
		return 0;
	}
	return psgClockHz / (YM_SID_TONE_PERIOD_DIVISOR * period);
}

export function exportTimerFrequencyHzFromYmPeriod(
	chipFrequencyHz: number,
	ymPeriod: number
): number {
	const toneHz = ymSidToneFrequencyHz(chipFrequencyHz, ymPeriod);
	if (toneHz <= 0) {
		return 0;
	}
	return toneHz * TMR_EXPORT_TIMER_FREQUENCY_TONE_MULTIPLIER;
}

export function exportTimerFrequencyStoredFromYmPeriod(
	ymPeriod: number,
	chipFrequencyHz: number
): number {
	const exportHz = exportTimerFrequencyHzFromYmPeriod(chipFrequencyHz, ymPeriod);
	if (exportHz <= 0) {
		return 0;
	}
	return encodeTimerFrequencyHz(exportHz);
}

export function timerFrequencyHzToPeriodTicks(psgClockHz: number, hz: number): number {
	if (hz <= 0) {
		return 0;
	}
	return Math.max(1, Math.round(psgClockHz / hz));
}

export function registerMaskFromEventPsgApplyMask(mask: number): number {
	return mask & ~TMR_PSG_MASK_TIMER_BITS;
}

export function timerIndexFromEventPsgApplyMask(mask: number): number {
	return mask & TMR_PSG_MASK_TIMER_BITS;
}

export function encodeEventPsgApplyMask(registerMask: number, timerIndex: number): number {
	return registerMaskFromEventPsgApplyMask(registerMask) | (timerIndex & TMR_PSG_MASK_TIMER_BITS);
}
