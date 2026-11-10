import type { ChipField, ChipSchema, FieldType } from '../../chips/base/schema';
import { getGlobalColumnLabel } from '../../chips/base/schema';
import type { PatternConverter } from '../../chips/base/adapter';
import {
	getChannelEffectColumnLabel,
	getChannelLayout,
	isEffectFieldKey,
	MAX_CHANNEL_EFFECT_COLUMNS
} from '../../chips/base/channel-effect-columns';
import { Pattern } from '../../models/song';
import type { GenericPattern, GenericRow } from '../../models/song/generic';

export const INSTRUMENT_FIELD_KEY = 'instrument';
export const TABLE_FIELD_KEY = 'table';

export interface PianoRollFieldKeys {
	note: string | null;
	instrument: string | null;
	table: string | null;
}

export interface PianoRollChannelOption {
	songIndex: number;
	channelIndex: number;
	chipName: string;
	chipType: string;
	label: string;
}

export interface PianoRollLane {
	key: string;
	fieldKey: string;
	label: string;
	kind: 'value' | 'effect';
	isGlobal: boolean;
	fieldType: FieldType;
	length: number;
	allowZeroValue?: boolean;
	noteEquivalent?: boolean;
	color?: string;
	maxValue: number;
}

export interface AmplitudeField {
	key: string;
	max: number;
	allowZeroValue?: boolean;
}

export type PianoLaneFieldTarget = Pick<PianoRollLane, 'isGlobal' | 'fieldKey'>;

export function findNoteFieldKey(schema: ChipSchema): string | null {
	for (const field of Object.values(schema.fields)) {
		if (field.type === 'note' && !field.skip) return field.key;
	}
	return null;
}

export function pianoRollFieldKeys(schema: ChipSchema): PianoRollFieldKeys {
	return {
		note: findNoteFieldKey(schema),
		instrument: schema.fields[INSTRUMENT_FIELD_KEY] ? INSTRUMENT_FIELD_KEY : null,
		table: schema.fields[TABLE_FIELD_KEY] ? TABLE_FIELD_KEY : null
	};
}

export function amplitudeFields(schema: ChipSchema): AmplitudeField[] {
	const fields: AmplitudeField[] = [];
	for (const field of Object.values(schema.fields)) {
		if (!field.amplitude || field.skip) continue;
		fields.push({
			key: field.key,
			max: fieldMaxValue(field),
			allowZeroValue: field.allowZeroValue
		});
	}
	return fields;
}

export function listPianoRollChannels(
	songs: Array<{ getEffectiveChannelLabels(): string[] }>,
	chips: Array<{ name: string; type: string } | null | undefined>
): PianoRollChannelOption[] {
	const options: PianoRollChannelOption[] = [];
	for (let songIndex = 0; songIndex < songs.length; songIndex++) {
		const song = songs[songIndex];
		const chip = chips[songIndex];
		if (!song || !chip) continue;
		const labels = song.getEffectiveChannelLabels();
		for (let channelIndex = 0; channelIndex < labels.length; channelIndex++) {
			options.push({
				songIndex,
				channelIndex,
				chipName: chip.name,
				chipType: chip.type,
				label: labels[channelIndex] ?? `${channelIndex + 1}`
			});
		}
	}
	return options;
}

export function listPianoRollLanes(schema: ChipSchema, effectColumnCount: number): PianoRollLane[] {
	const layout = getChannelLayout(schema, effectColumnCount);
	const lanes = [
		...lanesFromFields(layout.template, layout.fields, false, schema),
		...(schema.globalFields
			? lanesFromFields(schema.globalTemplate ?? '', schema.globalFields, true, schema)
			: [])
	];
	return disambiguateLabels(lanes);
}

export function readPianoFieldValue(
	generic: GenericPattern,
	lane: PianoLaneFieldTarget,
	channelIndex: number,
	row: number
): unknown {
	return laneRow(generic, lane, channelIndex, row)?.[lane.fieldKey];
}

export function setPianoFieldValue(
	generic: GenericPattern,
	lane: PianoLaneFieldTarget,
	channelIndex: number,
	row: number,
	value: string | number | null | Record<string, unknown>
): boolean {
	const target = laneRow(generic, lane, channelIndex, row);
	if (!target || target[lane.fieldKey] === value) return false;
	target[lane.fieldKey] = value;
	return true;
}

export function pianoLaneBarValue(raw: unknown, lane: PianoRollLane): number | null {
	if (lane.kind !== 'value' || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
	if (raw === 0) return null;
	if (raw < 0) return 0;
	return Math.min(lane.maxValue, raw);
}

export function pianoLaneValueFromRatio(ratioFromBottom: number, lane: PianoRollLane): number {
	const clamped = Math.max(0, Math.min(1, ratioFromBottom));
	const value = Math.round(clamped * lane.maxValue);
	if (value <= 0) return lane.allowZeroValue ? -1 : 0;
	return value;
}

function laneRow(
	generic: GenericPattern,
	lane: PianoLaneFieldTarget,
	channelIndex: number,
	row: number
) {
	return lane.isGlobal ? generic.patternRows[row] : generic.channels[channelIndex]?.rows[row];
}

function lanesFromFields(
	template: string,
	fields: Record<string, ChipField>,
	isGlobal: boolean,
	schema: ChipSchema
): PianoRollLane[] {
	const lanes: PianoRollLane[] = [];
	for (const fieldKey of orderedFieldKeys(template, fields)) {
		const field = fields[fieldKey];
		if (!field || field.skip || field.type === 'note') continue;
		lanes.push(laneFromField(field, isGlobal, schema));
	}
	return lanes;
}

function orderedFieldKeys(template: string, fields: Record<string, ChipField>): string[] {
	const keys = new Set<string>();
	for (const match of template.matchAll(/\{([^}]+)\}/g)) {
		if (match[1]) keys.add(match[1]);
	}
	for (const key of Object.keys(fields)) keys.add(key);
	return [...keys];
}

function laneFromField(field: ChipField, isGlobal: boolean, schema: ChipSchema): PianoRollLane {
	const effect = isEffectFieldKey(field.key);
	const globalLabel = isGlobal ? getGlobalColumnLabel(schema, field.key) : field.key;
	const label =
		getChannelEffectColumnLabel(field.key) ??
		(isGlobal && globalLabel !== field.key ? globalLabel : humanizeFieldKey(field.key));
	return {
		key: `${isGlobal ? 'g' : 'c'}:${field.key}`,
		fieldKey: field.key,
		label,
		kind: effect ? 'effect' : 'value',
		isGlobal,
		fieldType: field.type,
		length: field.length,
		allowZeroValue: field.allowZeroValue,
		noteEquivalent: field.noteEquivalent,
		color: field.color,
		maxValue: effect ? 0 : fieldMaxValue(field)
	};
}

function disambiguateLabels(lanes: PianoRollLane[]): PianoRollLane[] {
	const counts = new Map<string, number>();
	for (const lane of lanes) counts.set(lane.label, (counts.get(lane.label) ?? 0) + 1);
	return lanes.map((lane) => {
		if ((counts.get(lane.label) ?? 0) < 2) return lane;
		return { ...lane, label: humanizeFieldKey(lane.fieldKey) };
	});
}

function humanizeFieldKey(key: string): string {
	const spaced = key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Za-z])(\d+)/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	if (!spaced) return key;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const FIELD_RADIX: Partial<Record<FieldType, number>> = { hex: 16, symbol: 36, dec: 10 };

function fieldMaxValue(field: ChipField): number {
	const radix = FIELD_RADIX[field.type];
	return radix ? radix ** Math.max(1, field.length) - 1 : 0;
}

export function blankChannelRow(
	converter: PatternConverter,
	schema: ChipSchema
): GenericRow | null {
	const pattern = new Pattern(0, 1, schema);
	for (const channel of pattern.channels) channel.effectColumnCount = MAX_CHANNEL_EFFECT_COLUMNS;
	return converter.toGeneric(pattern).channels[0]?.rows[0] ?? null;
}
