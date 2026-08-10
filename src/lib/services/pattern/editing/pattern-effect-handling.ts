import {
	MAX_TABLE_ID,
	tableDisplayCharToId,
	tableIdToDisplayChar
} from '../../../utils/table-id';

export type EffectLikeObject = {
	effect: number;
	delay: number;
	parameter: number;
	tableIndex?: number;
};

export class PatternEffectHandling {
	static effectIgnoresDelay(effect: number): boolean {
		return (
			effect === 'D'.charCodeAt(0) ||
			effect === 'S'.charCodeAt(0) ||
			effect === 4 ||
			effect === 5 ||
			effect === 6
		);
	}

	static isEmptyEffect(effect: EffectLikeObject | null | undefined): boolean {
		if (!effect) return true;
		const noTable =
			effect.tableIndex === undefined || effect.tableIndex < 0;
		return (
			effect.effect === 0 &&
			(effect.delay ?? 0) === 0 &&
			(effect.parameter ?? 0) === 0 &&
			noTable
		);
	}

	static formatEffectAsString(
		effect:
			| { effect: number; delay: number; parameter: number; tableIndex?: number }
			| null
			| undefined
	): string {
		if (!effect) return '....';
		let type: string;
		if (effect.effect === 0) {
			type = '.';
		} else if (effect.effect === 'A'.charCodeAt(0)) {
			type = 'A';
		} else if (effect.effect === 'V'.charCodeAt(0)) {
			type = 'V';
		} else if (effect.effect === 'S'.charCodeAt(0)) {
			type = 'S';
		} else if (effect.effect === 'P'.charCodeAt(0)) {
			type = 'P';
		} else if (effect.effect === 'E'.charCodeAt(0)) {
			type = 'E';
		} else if (effect.effect === 'D'.charCodeAt(0)) {
			type = 'D';
		} else if (effect.effect >= 1 && effect.effect <= 15) {
			type = effect.effect.toString(16).toUpperCase();
		} else {
			type = effect.effect.toString(16).toUpperCase();
		}
		const delay = PatternEffectHandling.formatEffectDelay(effect.effect, effect.delay);

		const noTableSyntax =
			effect.effect === 4 || effect.effect === 5;
		if (
			!noTableSyntax &&
			effect.tableIndex !== undefined &&
			effect.tableIndex >= 0
		) {
			const tableChar = this.tableIndexToChar(effect.tableIndex);
			return type + delay + 'T' + tableChar;
		}

		const param = PatternEffectHandling.formatEffectParameter(effect.parameter);
		return type + delay + param;
	}

	private static formatEffectDelay(effect: number, delay: number): string {
		if (PatternEffectHandling.effectIgnoresDelay(effect)) {
			return '.';
		}
		return (delay ?? 0).toString(16).toUpperCase().padStart(1, '0');
	}

	private static formatEffectParameter(parameter: number): string {
		return (parameter ?? 0).toString(16).toUpperCase().padStart(2, '0');
	}

	static parseEffectFromString(value: string): {
		effect: number;
		delay: number;
		parameter: number;
		tableIndex?: number;
	} | null {
		let type: number;
		const typeChar = value[0] || '.';
		if (typeChar === '.') {
			type = 0;
		} else if (typeChar === 'A' || typeChar === 'a') {
			type = 'A'.charCodeAt(0);
		} else if (typeChar === 'V' || typeChar === 'v') {
			type = 'V'.charCodeAt(0);
		} else if (typeChar === 'S' || typeChar === 's') {
			type = 'S'.charCodeAt(0);
		} else if (typeChar === 'P' || typeChar === 'p') {
			type = 'P'.charCodeAt(0);
		} else if (typeChar === 'E' || typeChar === 'e') {
			type = 'E'.charCodeAt(0);
		} else if (typeChar === 'D' || typeChar === 'd') {
			type = 'D'.charCodeAt(0);
		} else {
			type = parseInt(typeChar, 16) || 0;
		}
		const delay = parseInt(value[1] || '0', 16) || 0;

		const char2 = value[2] || '.';
		const noTableSyntax = type === 4 || type === 5;
		const noDelay = PatternEffectHandling.effectIgnoresDelay(type);
		const effectiveDelay = noDelay ? 0 : delay;
		if (!noTableSyntax && (char2 === 'T' || char2 === 't')) {
			const tableChar = value[3] || '.';
			let tableIndex = this.charToTableIndex(tableChar);
			if (tableIndex < 0) {
				tableIndex = 0;
			}
			const result = { effect: type, delay: effectiveDelay, parameter: 0, tableIndex };
			return this.isEmptyEffect(result) ? null : result;
		}

		const param = parseInt((value.slice(2, 4) || '00').replace(/\./g, '0'), 16) || 0;
		const result = { effect: type, delay: effectiveDelay, parameter: param };
		return this.isEmptyEffect(result) ? null : result;
	}

	private static tableIndexToChar(index: number): string {
		if (index < 0) return '.';
		return tableIdToDisplayChar(Math.min(index, MAX_TABLE_ID)) || '.';
	}

	private static charToTableIndex(char: string): number {
		return tableDisplayCharToId(char);
	}
}
