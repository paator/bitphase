import type { Pattern } from '../../models/song';
import type { Table } from '../../models/project';
import type { ChipSchema, ChipField } from '../../chips/base/schema';
import { readLastSpeedCommandOnRow, resolveSpeedCommand } from './playback-speed';

const DETUNE_EFFECT_TYPE = 'D'.charCodeAt(0);

export type PlaybackDetuneEffect = {
	effect: number;
	delay: number;
	parameter: number;
	tableIndex?: number;
};

export interface PlaybackCarryState {
	channelFields?: Array<Record<string, unknown>>;
	globalFields?: Record<string, unknown>;
	channelDetune?: Array<PlaybackDetuneEffect | null>;
	envelopeDetune?: PlaybackDetuneEffect;
	speed?: number;
	speedTable?: number;
	speedTablePosition?: number;
}

function toNum(v: unknown): number {
	if (v === undefined || v === null) return NaN;
	const n = Number(v);
	return Number.isNaN(n) ? NaN : n;
}

function isGlobalFieldValueSet(key: string, value: unknown, field: ChipField): boolean {
	if (value === undefined || value === null) return false;
	const n = toNum(value);
	if (Number.isNaN(n)) return false;
	const when = field.backtrackWhen ?? 'any';
	if (when === 'nonZero') return n !== 0;
	return true;
}

function isChannelFieldValueSet(key: string, value: unknown, field: ChipField): boolean {
	if (value === undefined || value === null) return false;
	if (field.type === 'note' || key === 'note') {
		const note = value as { name?: number } | undefined;
		const name = note?.name;
		return name !== undefined && name !== null && name !== 0;
	}
	const n = toNum(value);
	if (Number.isNaN(n)) return false;
	if (key === 'table') return n === -1 || n > 0;
	const when = field.backtrackWhen ?? 'any';
	if (when === 'nonZero') return n !== 0;
	return true;
}

type EffectSlot = {
	effect?: unknown;
	delay?: unknown;
	parameter?: unknown;
	tableIndex?: unknown;
};

function readDetuneEffect(slot: unknown): PlaybackDetuneEffect | null {
	if (!slot || typeof slot !== 'object') return null;
	const effect = slot as EffectSlot;
	if (effect.effect !== DETUNE_EFFECT_TYPE) return null;
	const parameter = toNum(effect.parameter);
	const delay = toNum(effect.delay);
	const tableIndex = toNum(effect.tableIndex);
	const command: PlaybackDetuneEffect = {
		effect: DETUNE_EFFECT_TYPE,
		delay: Number.isNaN(delay) ? 0 : delay,
		parameter: Number.isNaN(parameter) ? 0 : parameter & 0xff
	};
	if (!Number.isNaN(tableIndex) && tableIndex >= 0) {
		command.tableIndex = tableIndex;
	}
	return command;
}

function readLastDetuneOnRow(effects: unknown): PlaybackDetuneEffect | null {
	if (!Array.isArray(effects)) return null;
	let found: PlaybackDetuneEffect | null = null;
	for (const slot of effects) {
		const command = readDetuneEffect(slot);
		if (command) found = command;
	}
	return found;
}

function isPersistChannelField(key: string, field: ChipField): boolean {
	if (field.usedForBacktracking !== true) return false;
	if (field.type === 'note' || key === 'note') return false;
	return true;
}

export function collectPlaybackCarry(
	patternOrder: number[],
	getPattern: (patternId: number) => Pattern | undefined,
	targetOrderIndex: number,
	targetRow: number,
	schema: ChipSchema,
	tables?: Table[]
): PlaybackCarryState | null {
	if (targetOrderIndex < 0) return null;
	const targetPatternId = patternOrder[targetOrderIndex];
	const targetPattern =
		targetPatternId === undefined ? undefined : getPattern(targetPatternId);
	const channelCount = Math.max(
		schema.channelLabels?.length ?? 0,
		targetPattern?.channels?.length ?? 0
	);
	if (channelCount <= 0) return null;

	const channelFieldEntries = schema.fields
		? Object.entries(schema.fields).filter(([key, field]) =>
				isPersistChannelField(key, field)
			)
		: [];
	const globalFieldEntries = schema.globalFields
		? Object.entries(schema.globalFields).filter(
				([_, field]) => field.usedForBacktracking === true
			)
		: [];

	const channelFields = Array.from(
		{ length: channelCount },
		() => ({}) as Record<string, unknown>
	);
	const globalFields: Record<string, unknown> = {};
	const channelDetune: Array<PlaybackDetuneEffect | null> = Array.from(
		{ length: channelCount },
		() => null
	);
	const trackEnvelopeDetune = Boolean(schema.globalFields?.envelopeEffect);
	let envelopeDetune: PlaybackDetuneEffect | undefined;
	let speed: number | undefined;
	let speedTable: number | undefined;
	let speedTablePosition: number | undefined;
	let remaining =
		channelCount * channelFieldEntries.length +
		globalFieldEntries.length +
		channelCount +
		(trackEnvelopeDetune ? 1 : 0) +
		1;
	if (remaining === 0) return null;

	for (let orderIndex = targetOrderIndex; orderIndex >= 0 && remaining > 0; orderIndex--) {
		const patternId = patternOrder[orderIndex];
		const pattern = patternId === undefined ? undefined : getPattern(patternId);
		if (!pattern?.channels?.length) continue;
		const rowStart =
			orderIndex === targetOrderIndex ? targetRow - 1 : pattern.length - 1;
		for (let rowIndex = rowStart; rowIndex >= 0 && remaining > 0; rowIndex--) {
			const patternRow = pattern.patternRows?.[rowIndex] as
				| Record<string, unknown>
				| undefined;
			for (const [key, field] of globalFieldEntries) {
				if (key in globalFields) continue;
				const value = patternRow?.[key];
				if (!isGlobalFieldValueSet(key, value, field)) continue;
				globalFields[key] = value;
				remaining--;
			}
			if (trackEnvelopeDetune && !envelopeDetune) {
				const command = readDetuneEffect(patternRow?.envelopeEffect);
				if (command) {
					envelopeDetune = command;
					remaining--;
				}
			}
			if (speed === undefined && speedTable === undefined) {
				const command = readLastSpeedCommandOnRow(pattern.channels, rowIndex);
				if (command) {
					const resolved = resolveSpeedCommand(command, tables);
					if (resolved) {
						speed = resolved.speed;
						speedTable = resolved.speedTable;
						speedTablePosition = resolved.speedTablePosition;
						remaining--;
					}
				}
			}
			for (let ch = 0; ch < channelCount && ch < pattern.channels.length; ch++) {
				const row = pattern.channels[ch].rows?.[rowIndex] as
					| Record<string, unknown>
					| undefined;
				if (!row) continue;
				const carryForChannel = channelFields[ch];
				for (const [key, field] of channelFieldEntries) {
					if (key in carryForChannel) continue;
					const value = row[key];
					if (!isChannelFieldValueSet(key, value, field)) continue;
					carryForChannel[key] = value;
					remaining--;
				}
				if (!channelDetune[ch]) {
					const command = readLastDetuneOnRow(row.effects);
					if (command) {
						channelDetune[ch] = command;
						remaining--;
					}
				}
			}
		}
	}

	const hasChannelFields = channelFields.some(
		(fields) => Object.keys(fields).length > 0
	);
	const hasGlobalFields = Object.keys(globalFields).length > 0;
	const hasChannelDetune = channelDetune.some((command) => command !== null);
	if (
		!hasChannelFields &&
		!hasGlobalFields &&
		!hasChannelDetune &&
		!envelopeDetune &&
		speed === undefined &&
		speedTable === undefined
	) {
		return null;
	}

	const carry: PlaybackCarryState = {};
	if (hasChannelFields) carry.channelFields = channelFields;
	if (hasGlobalFields) carry.globalFields = globalFields;
	if (hasChannelDetune) carry.channelDetune = channelDetune;
	if (envelopeDetune) carry.envelopeDetune = envelopeDetune;
	if (speed !== undefined) carry.speed = speed;
	if (speedTable !== undefined) {
		carry.speedTable = speedTable;
		carry.speedTablePosition = speedTablePosition ?? 0;
	}
	return carry;
}
