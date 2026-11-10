export type FieldType = 'note' | 'hex' | 'symbol' | 'dec' | 'text';

export type BacktrackWhen = 'any' | 'nonZero';

export interface ChipField {
	key: string;
	type: FieldType;
	length: number;
	color?: string;
	selectable?: 'atomic' | 'character';
	skip?: boolean;
	defaultValue?: unknown;
	allowZeroValue?: boolean;
	usedForBacktracking?: boolean;
	backtrackWhen?: BacktrackWhen;
	previewOnEdit?: boolean;
	noteEquivalent?: boolean;
	amplitude?: boolean;
}

export type SettingType = 'text' | 'number' | 'select' | 'toggle';

export interface SettingOption {
	label: string;
	value: string | number | boolean;
}

export interface ChipSettingSideEffect {
	key: string;
	value: unknown;
}

export interface ChipSetting {
	key: string;
	label: string;
	type: SettingType;
	options?: SettingOption[];
	defaultValue?: unknown;
	group?: string;
	notifyAudioService?: boolean;
	min?: number;
	max?: number;
	step?: number;
	computedHint?: (value: unknown, context: Record<string, unknown>) => string;
	resolveDisplayValue?: (value: unknown, context: Record<string, unknown>) => unknown;
	fullWidth?: boolean;
	dependsOn?: string[];
	dynamicOption?: { value: number; label: (context: Record<string, unknown>) => string };
	showWhen?: { key: string; value: unknown };
	disabledWhen?: { key: string; value: unknown };
	startNewRow?: boolean;
}

export interface StickyEffectCommand {
	effect: number;
	delay: number;
	parameter?: number;
	tableIndex?: number;
}

export interface GlobalStickyRowRead {
	group: string | null;
	closesEarlierGroups: boolean;
	survivesClose?: boolean;
	skipFieldKeys?: string[];
	commandFields?: Record<string, number>;
	effect?: unknown;
	fieldKey?: string;
}

export interface GlobalAnchor {
	field: string;
	beforeChannel: number;
}

export interface ChipSchema {
	chipType: string;
	template: string;
	fields: Record<string, ChipField>;
	globalTemplate?: string;
	globalFields?: Record<string, ChipField>;
	globalAnchors?: GlobalAnchor[];
	channelLabels?: string[];
	globalColumnLabels?: Record<string, string>;
	settings?: ChipSetting[];
	defaultTuningTable?: number[];
	defaultChipVariant?: string;
	resolveTuningTable?: (song: Record<string, unknown>) => number[];
	tuningTableSettingKeys?: string[];
	applySettingSideEffects?: (
		key: string,
		value: unknown,
		context: Record<string, unknown>
	) => ChipSettingSideEffect[];
	normalizeSettings?: (record: Record<string, unknown>) => Record<string, unknown>;
	stickyChannelEffectGroup?: (effect: StickyEffectCommand, channelIndex: number) => string | null;
	stickyChannelEffectIsShared?: (group: string) => boolean;
	readGlobalStickyRow?: (
		patternRow: Record<string, unknown>,
		channelRows: Array<Record<string, unknown> | undefined>
	) => GlobalStickyRowRead;
}

export function applySchemaDefaults<T extends object>(target: T, schema: ChipSchema): void {
	if (!schema.settings) return;

	for (const setting of schema.settings) {
		if (setting.defaultValue !== undefined) {
			const key = setting.key;
			const currentValue = (target as any)[key];
			if (currentValue === undefined) {
				(target as any)[key] = setting.defaultValue;
			}
		}
	}

	if (schema.normalizeSettings) {
		const normalized = schema.normalizeSettings(target as Record<string, unknown>);
		Object.assign(target, normalized);
	}
}

export function getGlobalColumnLabel(schema: ChipSchema, fieldKey: string): string {
	return schema.globalColumnLabels?.[fieldKey] ?? fieldKey;
}

export function getDefaultForFieldType(
	type: FieldType,
	fieldKey?: string,
	allowZeroValue?: boolean
): unknown {
	switch (type) {
		case 'hex':
		case 'dec':
		case 'symbol':
			return 0;
		case 'note':
			return null;
		case 'text':
			return '';
		default:
			return 0;
	}
}
