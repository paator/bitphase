import { isEffectFieldKey } from '../../../chips/base/channel-effect-columns';
import { PatternEffectHandling } from './pattern-effect-handling';

export class EffectField {
	static isEffectField(fieldKey: string): boolean {
		return isEffectFieldKey(fieldKey);
	}

	static formatValue(value: unknown): string | null {
		if (typeof value !== 'object' || value === null) {
			return null;
		}
		const effectObj = this.toEffectObject(value);
		return PatternEffectHandling.formatEffectAsString(effectObj);
	}

	static parseValue(str: string): {
		effect: number;
		delay: number;
		parameter: number;
		tableIndex?: number;
	} | null {
		return PatternEffectHandling.parseEffectFromString(str);
	}

	private static toEffectObject(
		value: unknown
	): { effect: number; delay: number; parameter: number; tableIndex?: number } | null {
		if (typeof value === 'object' && value !== null) {
			return value as {
				effect: number;
				delay: number;
				parameter: number;
				tableIndex?: number;
			};
		}
		return null;
	}
}
