import type { Pattern } from '../../models/song';
import type { Table } from '../../models/project';

export const SPEED_EFFECT_TYPE = 'S'.charCodeAt(0);

export type SpeedCommand = {
	parameter: number;
	tableIndex?: number;
};

export type ResolvedPlaybackSpeed = {
	speed?: number;
	speedTable: number;
	speedTablePosition: number;
	ownerChipIndex: number;
};

type EffectSlot = {
	effect?: unknown;
	parameter?: unknown;
	tableIndex?: unknown;
};

function toNum(v: unknown): number {
	if (v === undefined || v === null) return NaN;
	const n = Number(v);
	return Number.isNaN(n) ? NaN : n;
}

export function readLastSpeedCommandOnRow(
	channels: Array<{ rows?: Array<{ effects?: unknown }> }> | undefined,
	rowIndex: number
): SpeedCommand | null {
	if (!channels || rowIndex < 0) return null;
	let found: SpeedCommand | null = null;
	for (const channel of channels) {
		const effects = channel.rows?.[rowIndex]?.effects;
		if (!Array.isArray(effects)) continue;
		for (const slot of effects) {
			if (!slot || typeof slot !== 'object') continue;
			const effect = slot as EffectSlot;
			if (effect.effect !== SPEED_EFFECT_TYPE) continue;
			const tableIndex = toNum(effect.tableIndex);
			const parameter = toNum(effect.parameter);
			const command: SpeedCommand = {
				parameter: Number.isNaN(parameter) ? 0 : parameter
			};
			if (!Number.isNaN(tableIndex) && tableIndex >= 0) {
				command.tableIndex = tableIndex;
			}
			found = command;
		}
	}
	return found;
}

export function resolveSpeedCommand(
	command: SpeedCommand,
	tables: Table[] | undefined
): { speed?: number; speedTable: number; speedTablePosition: number } | null {
	if (command.tableIndex !== undefined && command.tableIndex >= 0) {
		const table = tables?.find((entry) => entry.id === command.tableIndex);
		if (!table?.rows?.length) {
			return {
				speedTable: command.tableIndex,
				speedTablePosition: 0
			};
		}
		let position = 0;
		while (position < table.rows.length && (table.rows[position] ?? 0) <= 0) {
			position++;
		}
		if (position >= table.rows.length) {
			return { speedTable: command.tableIndex, speedTablePosition: 0 };
		}
		const speed = table.rows[position] ?? 0;
		return {
			speed: speed > 0 ? speed : undefined,
			speedTable: command.tableIndex,
			speedTablePosition: position
		};
	}
	if (command.parameter > 0) {
		return { speed: command.parameter, speedTable: -1, speedTablePosition: 0 };
	}
	return null;
}

export function findLastSpeedCommand(
	patternLists: Array<Pattern[] | undefined>,
	order: number[],
	startOrderIndex: number,
	startRow: number,
	tables?: Table[]
): ResolvedPlaybackSpeed | null {
	if (order.length === 0) return null;
	let orderIndex = startOrderIndex;
	let row = startRow;
	if (row < 0) {
		orderIndex -= 1;
		row = Number.MAX_SAFE_INTEGER;
	}
	if (orderIndex < 0) return null;
	const maxOrder = Math.min(orderIndex, order.length - 1);
	for (let index = maxOrder; index >= 0; index--) {
		const patternId = order[index];
		const patternsAtOrder = patternLists.map((list) =>
			list?.find((pattern) => pattern.id === patternId)
		);
		const maxLength = Math.max(0, ...patternsAtOrder.map((pattern) => pattern?.length ?? 0));
		if (maxLength <= 0) continue;
		const rowStart = index === orderIndex ? row : maxLength - 1;
		const rowEnd = Math.min(rowStart, maxLength - 1);
		for (let rowIndex = rowEnd; rowIndex >= 0; rowIndex--) {
			let command: SpeedCommand | null = null;
			let ownerChipIndex = 0;
			for (let chipIndex = 0; chipIndex < patternsAtOrder.length; chipIndex++) {
				const pattern = patternsAtOrder[chipIndex];
				if (!pattern || rowIndex >= pattern.length) continue;
				const rowCommand = readLastSpeedCommandOnRow(pattern.channels, rowIndex);
				if (rowCommand) {
					command = rowCommand;
					ownerChipIndex = chipIndex;
				}
			}
			if (!command) continue;
			const resolved = resolveSpeedCommand(command, tables);
			if (!resolved) continue;
			return { ...resolved, ownerChipIndex };
		}
	}
	return null;
}
