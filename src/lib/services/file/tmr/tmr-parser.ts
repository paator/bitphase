import { AY_REGISTER_COUNT, registerApplyMask } from '../ay/ay-export-utils';
import {
	decodeTimerFrequencyHz,
	registerMaskFromEventPsgApplyMask,
	timerFrequencyHzToPeriodTicks,
	timerIndexFromEventPsgApplyMask,
	TMR_FRAME_SIZE,
	TMR_HEADER_SIZE,
	TMR_ITEM_SIZE,
	TMR_TIMER_EVENT_STOP,
	type TmrEventItemRecord
} from './tmr-format';
import { readEventItems, TEL_HEADER_SIZE } from './tmr-event-list';

export const TMR_MAGIC = [0x54, 0x4d, 0x52, 0x1a] as const;

export const AY_REGISTER_NAMES = [
	'Tone A fine',
	'Tone A coarse',
	'Tone B fine',
	'Tone B coarse',
	'Tone C fine',
	'Tone C coarse',
	'Noise period',
	'Mixer',
	'Volume A',
	'Volume B',
	'Volume C',
	'Env period fine',
	'Env period coarse',
	'Env shape'
] as const;

export type TmrTimerCommand = 'none' | 'start' | 'stop';

export type ParsedTmrHeader = {
	version: number;
	headerSize: number;
	flags: number;
	isYm: boolean;
	chipIndex: number;
	frameRateHz: number;
	psgClockHz: number;
	frameCount: number;
};

export type ParsedTimerSlot = {
	frequencyHz: number;
	eventIndex: number;
	command: TmrTimerCommand;
};

export type ParsedTmrFrame = {
	index: number;
	psgApplyMask: number;
	timers: [ParsedTimerSlot, ParsedTimerSlot, ParsedTimerSlot];
};

export type ParsedEventItem = {
	index: number;
	byteOffset: number;
	psgData: number[];
	psgApplyMask: number;
	registerApplyMask: number;
	timerIndex: number;
	frequencyHz: number;
	timerEventIndex: number;
};

export type ParsedTmrFile = {
	fileSize: number;
	header: ParsedTmrHeader;
	frames: ParsedTmrFrame[];
	eventItems: ParsedEventItem[];
};

export type TmrParseResult =
	| { ok: true; file: ParsedTmrFile }
	| { ok: false; errors: string[] };

export function parseTMR(buffer: ArrayBuffer): TmrParseResult {
	const errors: string[] = [];
	const bytes = new Uint8Array(buffer);

	if (bytes.length < TMR_HEADER_SIZE) {
		return { ok: false, errors: [`File too small (${bytes.length} bytes, need at least ${TMR_HEADER_SIZE})`] };
	}

	for (let index = 0; index < TMR_MAGIC.length; index++) {
		if (bytes[index] !== TMR_MAGIC[index]) {
			errors.push(
				`Invalid magic at byte ${index}: expected 0x${TMR_MAGIC[index]!.toString(16).toUpperCase()}, got 0x${bytes[index]!.toString(16).toUpperCase()}`
			);
		}
	}

	const view = new DataView(buffer);
	const version = view.getUint16(4, true);
	const headerSize = view.getUint16(6, true);
	const flags = view.getUint16(8, true);
	const chipIndex = view.getUint8(10);
	const frameRateRaw = view.getUint32(12, true);
	const psgClockHz = view.getUint32(16, true);
	const frameCount = view.getUint32(20, true);

	if (version !== 1) {
		errors.push(`Unsupported version ${version} (expected 1)`);
	}
	if (headerSize !== TMR_HEADER_SIZE) {
		errors.push(`Unexpected header size ${headerSize} (expected ${TMR_HEADER_SIZE})`);
	}

	const framesBytes = frameCount * TMR_FRAME_SIZE;
	const expectedMinSize = TMR_HEADER_SIZE + framesBytes;
	if (bytes.length < expectedMinSize) {
		errors.push(
			`File too small for ${frameCount} frames (need ${expectedMinSize} bytes, got ${bytes.length})`
		);
	}

	const remainder = bytes.length - expectedMinSize;
	if (remainder !== 0 && remainder % TMR_ITEM_SIZE !== 0) {
		errors.push(`Unexpected trailing ${remainder} bytes after player frames`);
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const embeddedEventCount = remainder / TMR_ITEM_SIZE;
	const header: ParsedTmrHeader = {
		version,
		headerSize,
		flags,
		isYm: (flags & 1) !== 0,
		chipIndex,
		frameRateHz: frameRateRaw / 65536,
		psgClockHz,
		frameCount
	};

	const frames: ParsedTmrFrame[] = [];
	let offset = TMR_HEADER_SIZE;
	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		const psgApplyMask = view.getUint16(offset, true);
		offset += 2;
		const timers: ParsedTimerSlot[] = [];
		for (let timerIndex = 0; timerIndex < 3; timerIndex++) {
			const frequencyStored = view.getUint32(offset, true);
			offset += 4;
			const eventIndex = view.getUint16(offset, true);
			offset += 2;
			timers.push({
				frequencyHz: decodeTimerFrequencyHz(frequencyStored),
				eventIndex,
				command: resolveTimerCommand(frequencyStored, eventIndex)
			});
		}
		frames.push({
			index: frameIndex,
			psgApplyMask,
			timers: timers as [ParsedTimerSlot, ParsedTimerSlot, ParsedTimerSlot]
		});
	}

	const eventItems =
		embeddedEventCount > 0
			? toParsedEventItems(
					readEventItems(view, offset, embeddedEventCount),
					offset
				)
			: [];

	return {
		ok: true,
		file: {
			fileSize: bytes.length,
			header,
			frames,
			eventItems
		}
	};
}

export function toParsedEventItems(
	records: TmrEventItemRecord[],
	byteOffsetBase: number
): ParsedEventItem[] {
	return records.map((record, index) => {
		const registerApplyMaskValue = registerMaskFromEventPsgApplyMask(record.psgMask);
		return {
			index,
			byteOffset: byteOffsetBase + index * TMR_ITEM_SIZE,
			psgData: record.psgData,
			psgApplyMask: record.psgMask,
			registerApplyMask: registerApplyMaskValue,
			timerIndex: timerIndexFromEventPsgApplyMask(record.psgMask),
			frequencyHz: decodeTimerFrequencyHz(record.timerFrequency),
			timerEventIndex: record.timerEventIndex
		};
	});
}

export function attachEventListToTmrFile(
	file: ParsedTmrFile,
	records: TmrEventItemRecord[],
	byteOffsetBase = TEL_HEADER_SIZE
): ParsedTmrFile {
	return {
		...file,
		eventItems: toParsedEventItems(records, byteOffsetBase)
	};
}

export function resolveTimerCommand(frequencyStored: number, eventIndex: number): TmrTimerCommand {
	if (eventIndex === TMR_TIMER_EVENT_STOP) {
		return 'stop';
	}
	if (frequencyStored !== 0 || eventIndex !== 0) {
		if (frequencyStored > 0 && eventIndex !== TMR_TIMER_EVENT_STOP) {
			return 'start';
		}
	}
	return 'none';
}

export function formatHex(value: number, width = 4): string {
	return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

export function formatHz(value: number): string {
	if (Number.isInteger(value)) {
		return `${value} Hz`;
	}
	return `${value.toFixed(2)} Hz`;
}

export function formatTimerFrequencyHz(frequencyHz: number): string {
	if (frequencyHz >= 1_000_000) {
		return `${(frequencyHz / 1_000_000).toFixed(3)} MHz`;
	}
	if (frequencyHz >= 1000) {
		return `${(frequencyHz / 1000).toFixed(3)} kHz`;
	}
	return formatHz(frequencyHz);
}

export function formatClockHz(value: number): string {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(4)} MHz`;
	}
	return `${value.toLocaleString()} Hz`;
}

export function formatMaskRegisters(mask: number): string {
	const registerMask = registerMaskFromEventPsgApplyMask(mask);
	const names: string[] = [];
	for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
		if (registerMask & registerApplyMask(regIndex)) {
			names.push(`R${regIndex}`);
		}
	}
	return names.length > 0 ? names.join(' ') : '—';
}

export function formatMaskRegisterDetails(mask: number): string {
	const registerMask = registerMaskFromEventPsgApplyMask(mask);
	const names: string[] = [];
	for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
		if (registerMask & registerApplyMask(regIndex)) {
			names.push(`R${regIndex} ${AY_REGISTER_NAMES[regIndex]}`);
		}
	}
	return names.length > 0 ? names.join(', ') : 'No register writes';
}

export function formatEventItemWrites(item: ParsedEventItem): string {
	const parts: string[] = [];
	for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
		if (item.registerApplyMask & registerApplyMask(regIndex)) {
			parts.push(`R${regIndex}=${formatHex(item.psgData[regIndex]!, 2)}`);
		}
	}
	return parts.length > 0 ? parts.join('  ') : '—';
}

export function formatTimerSlotLabel(timerIndex: number): string {
	return ['A', 'B', 'C'][timerIndex] ?? String(timerIndex + 1);
}

export function formatTimerSlotSummary(slot: ParsedTimerSlot): string {
	if (slot.command === 'stop') {
		return 'STOP';
	}
	if (slot.command === 'start') {
		return `START  ${formatTimerFrequencyHz(slot.frequencyHz)}  → event #${slot.eventIndex}`;
	}
	return '—';
}

export function summarizeTmrFile(file: ParsedTmrFile): {
	activeFrameCount: number;
	startCount: number;
	stopCount: number;
} {
	let startCount = 0;
	let stopCount = 0;
	let activeFrameCount = 0;

	for (const frame of file.frames) {
		let frameActive = false;
		for (const timer of frame.timers) {
			if (timer.command === 'start') {
				startCount++;
				frameActive = true;
			}
			if (timer.command === 'stop') {
				stopCount++;
				frameActive = true;
			}
		}
		if (frameActive) {
			activeFrameCount++;
		}
	}

	return { activeFrameCount, startCount, stopCount };
}

export type TmrScheduleEntryKind = 'start' | 'stop' | 'fire';

export type TmrScheduleEntry = {
	frame: number;
	tickInFrame: number;
	timeMs: number;
	timerIndex: number;
	kind: TmrScheduleEntryKind;
	eventIndex?: number;
	frequencyHz?: number;
	eventTimerIndex?: number;
	writes?: string;
	nextLabel?: string;
};

export type TmrScheduleResult = {
	entries: TmrScheduleEntry[];
	chipTicksPerFrame: number;
	truncated: boolean;
};

type TimerRuntimeState = {
	active: boolean;
	frequencyHz: number;
	periodTicks: number;
	eventIndex: number;
	countdown: number;
};

export function buildTmrSchedule(file: ParsedTmrFile, maxEntries = 5000): TmrScheduleResult {
	const chipTicksPerFrame = Math.max(
		1,
		Math.round(file.header.psgClockHz / Math.max(file.header.frameRateHz, 1))
	);
	const entries: TmrScheduleEntry[] = [];
	let truncated = false;

	const timers: TimerRuntimeState[] = Array.from({ length: 3 }, () => ({
		active: false,
		frequencyHz: 0,
		periodTicks: 1,
		eventIndex: 0,
		countdown: 1
	}));

	const pushEntry = (entry: TmrScheduleEntry) => {
		if (entries.length >= maxEntries) {
			truncated = true;
			return false;
		}
		entries.push(entry);
		return true;
	};

	const scheduleTimeMs = (frame: number, tickInFrame: number) =>
		((frame * chipTicksPerFrame + tickInFrame) / file.header.psgClockHz) * 1000;

	for (const frame of file.frames) {
		for (let timerIndex = 0; timerIndex < 3; timerIndex++) {
			const slot = frame.timers[timerIndex]!;
			const timer = timers[timerIndex]!;

			if (slot.command === 'stop') {
				timer.active = false;
				if (
					!pushEntry({
						frame: frame.index,
						tickInFrame: 0,
						timeMs: scheduleTimeMs(frame.index, 0),
						timerIndex,
						kind: 'stop'
					})
				) {
					return { entries, chipTicksPerFrame, truncated: true };
				}
			} else if (slot.command === 'start') {
				timer.active = true;
				timer.frequencyHz = slot.frequencyHz;
				timer.periodTicks = timerFrequencyHzToPeriodTicks(
					file.header.psgClockHz,
					slot.frequencyHz
				);
				timer.eventIndex = slot.eventIndex;
				timer.countdown = timer.periodTicks;
				if (
					!pushEntry({
						frame: frame.index,
						tickInFrame: 0,
						timeMs: scheduleTimeMs(frame.index, 0),
						timerIndex,
						kind: 'start',
						eventIndex: slot.eventIndex,
						frequencyHz: slot.frequencyHz
					})
				) {
					return { entries, chipTicksPerFrame, truncated: true };
				}
			}
		}

		for (let tickInFrame = 0; tickInFrame < chipTicksPerFrame; tickInFrame++) {
			for (let timerIndex = 0; timerIndex < 3; timerIndex++) {
				const timer = timers[timerIndex]!;
				if (!timer.active) {
					continue;
				}

				timer.countdown -= 1;
				if (timer.countdown > 0) {
					continue;
				}

				const item = file.eventItems[timer.eventIndex];
				if (!item) {
					timer.active = false;
					continue;
				}

				const nextLabel =
					item.timerEventIndex === TMR_TIMER_EVENT_STOP
						? 'STOP'
						: `#${item.timerEventIndex}`;

				const fireFrequencyHz = timer.frequencyHz;

				if (
					!pushEntry({
						frame: frame.index,
						tickInFrame,
						timeMs: scheduleTimeMs(frame.index, tickInFrame),
						timerIndex,
						kind: 'fire',
						eventIndex: timer.eventIndex,
						eventTimerIndex: item.timerIndex,
						frequencyHz: fireFrequencyHz,
						writes: formatEventItemWrites(item),
						nextLabel
					})
				) {
					return { entries, chipTicksPerFrame, truncated: true };
				}

				if (item.timerEventIndex === TMR_TIMER_EVENT_STOP) {
					timer.active = false;
					continue;
				}

				timer.eventIndex = item.timerEventIndex;
				if (item.frequencyHz > 0) {
					timer.frequencyHz = item.frequencyHz;
					timer.periodTicks = timerFrequencyHzToPeriodTicks(
						file.header.psgClockHz,
						item.frequencyHz
					);
				}
				timer.countdown = timer.periodTicks;
			}
		}
	}

	return { entries, chipTicksPerFrame, truncated };
}

export function formatScheduleTimeMs(timeMs: number): string {
	if (timeMs < 1000) {
		return `${timeMs.toFixed(3)} ms`;
	}
	const seconds = timeMs / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(3)} s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds - minutes * 60;
	return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`;
}

export function formatScheduleEntry(entry: TmrScheduleEntry): string {
	const timer = formatTimerSlotLabel(entry.timerIndex);
	if (entry.kind === 'start') {
		const frequency =
			entry.frequencyHz !== undefined ? formatTimerFrequencyHz(entry.frequencyHz) : '—';
		return `Timer ${timer} START → event #${entry.eventIndex}, ${frequency}`;
	}
	if (entry.kind === 'stop') {
		return `Timer ${timer} STOP`;
	}
	const frequency =
		entry.frequencyHz !== undefined ? formatTimerFrequencyHz(entry.frequencyHz) : '—';
	return `Timer ${timer} fire event #${entry.eventIndex} @ ${frequency}: ${entry.writes ?? '—'} → ${entry.nextLabel ?? '—'}`;
}

export type TmrEventFireSchedule = {
	timeMs: number;
	frequencyHz: number;
};

export function collectEventFireSchedules(
	schedule: TmrScheduleResult
): Map<number, TmrEventFireSchedule[]> {
	const firesByEvent = new Map<number, TmrEventFireSchedule[]>();
	for (const entry of schedule.entries) {
		if (entry.kind !== 'fire' || entry.eventIndex === undefined || entry.frequencyHz === undefined) {
			continue;
		}
		const fires = firesByEvent.get(entry.eventIndex) ?? [];
		fires.push({ timeMs: entry.timeMs, frequencyHz: entry.frequencyHz });
		firesByEvent.set(entry.eventIndex, fires);
	}
	return firesByEvent;
}

export function collectEventScheduleTimes(
	schedule: TmrScheduleResult
): Map<number, number[]> {
	const timesByEvent = new Map<number, number[]>();
	for (const entry of schedule.entries) {
		if (entry.kind !== 'fire' || entry.eventIndex === undefined) {
			continue;
		}
		const times = timesByEvent.get(entry.eventIndex) ?? [];
		times.push(entry.timeMs);
		timesByEvent.set(entry.eventIndex, times);
	}
	return timesByEvent;
}

export function formatEventFireSchedules(
	fires: TmrEventFireSchedule[] | undefined,
	limit = 3
): string {
	if (!fires || fires.length === 0) {
		return '—';
	}
	const formatted = fires
		.slice(0, limit)
		.map(
			(fire) =>
				`${formatScheduleTimeMs(fire.timeMs)} @ ${formatTimerFrequencyHz(fire.frequencyHz)}`
		);
	if (fires.length > limit) {
		formatted.push(`+${fires.length - limit} more`);
	}
	return formatted.join(', ');
}

export function formatEventScheduleTimes(times: number[] | undefined, limit = 3): string {
	if (!times || times.length === 0) {
		return '—';
	}
	const formatted = times.slice(0, limit).map((timeMs) => formatScheduleTimeMs(timeMs));
	if (times.length > limit) {
		formatted.push(`+${times.length - limit} more`);
	}
	return formatted.join(', ');
}
