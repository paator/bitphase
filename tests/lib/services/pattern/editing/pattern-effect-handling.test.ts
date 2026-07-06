import { describe, it, expect } from 'vitest';
import { PatternEffectHandling } from '@/lib/services/pattern/editing/pattern-effect-handling';

describe('PatternEffectHandling', () => {
	describe('formatEffectAsString', () => {
		it('formats auto-envelope effect EA32', () => {
			const result = PatternEffectHandling.formatEffectAsString({
				effect: 'E'.charCodeAt(0),
				delay: 0xa,
				parameter: 0x32
			});
			expect(result).toBe('EA32');
		});

		it('formats auto-envelope effect EA11', () => {
			const result = PatternEffectHandling.formatEffectAsString({
				effect: 'E'.charCodeAt(0),
				delay: 0xa,
				parameter: 0x11
			});
			expect(result).toBe('EA11');
		});

		it('formats auto-envelope effect with zero delay as E032', () => {
			const result = PatternEffectHandling.formatEffectAsString({
				effect: 'E'.charCodeAt(0),
				delay: 0,
				parameter: 0x32
			});
			expect(result).toBe('E032');
		});
	});

	describe('parseEffectFromString', () => {
		it('parses EA32 as auto-envelope effect', () => {
			const result = PatternEffectHandling.parseEffectFromString('EA32');
			expect(result.effect).toBe('E'.charCodeAt(0));
			expect(result.delay).toBe(0xa);
			expect(result.parameter).toBe(0x32);
		});

		it('parses EA11 as auto-envelope with 1:1 ratio', () => {
			const result = PatternEffectHandling.parseEffectFromString('EA11');
			expect(result.effect).toBe('E'.charCodeAt(0));
			expect(result.delay).toBe(0xa);
			expect(result.parameter).toBe(0x11);
		});

		it('parses lowercase ea32', () => {
			const result = PatternEffectHandling.parseEffectFromString('ea32');
			expect(result.effect).toBe('E'.charCodeAt(0));
			expect(result.delay).toBe(0xa);
			expect(result.parameter).toBe(0x32);
		});

		it('roundtrips EA32 through format and parse', () => {
			const original = {
				effect: 'E'.charCodeAt(0),
				delay: 0xa,
				parameter: 0x32
			};
			const formatted = PatternEffectHandling.formatEffectAsString(original);
			const parsed = PatternEffectHandling.parseEffectFromString(formatted);
			expect(parsed.effect).toBe(original.effect);
			expect(parsed.delay).toBe(original.delay);
			expect(parsed.parameter).toBe(original.parameter);
		});

		it('effect 4 (sample position) formats as parameter even with tableIndex, ignores table syntax', () => {
			const result = PatternEffectHandling.formatEffectAsString({
				effect: 4,
				delay: 0,
				parameter: 0x0a,
				tableIndex: 2
			});
			expect(result).toBe('400A');
		});

		it('effect 5 (ornament position) parses 5050 as parameter not table', () => {
			const result = PatternEffectHandling.parseEffectFromString('5050');
			expect(result.effect).toBe(5);
			expect(result.parameter).toBe(0x50);
			expect(result.tableIndex).toBeUndefined();
		});

		it('Speed with table S.T4 parses and roundtrips', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('S.T4');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe('S'.charCodeAt(0));
			expect(parsed!.tableIndex).toBe(3);
			expect(parsed!.delay).toBe(0);
			const formatted = PatternEffectHandling.formatEffectAsString(parsed!);
			expect(formatted).toBe('S0T4');
		});

		it('Speed with table S.T. preserves T when table char is placeholder', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('S.T.');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe('S'.charCodeAt(0));
			expect(parsed!.tableIndex).toBe(0);
			const formatted = PatternEffectHandling.formatEffectAsString(parsed!);
			expect(formatted).toBe('S0T1');
		});

		it('Detune with table D.TG parses table 16 (G)', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('D.TG');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe('D'.charCodeAt(0));
			expect(parsed!.tableIndex).toBe(15);
			const formatted = PatternEffectHandling.formatEffectAsString(parsed!);
			expect(formatted).toBe('D0TG');
		});

		it('effect 6 (on/off) ignores delay digit and formats with zero delay', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('6124');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe(6);
			expect(parsed!.delay).toBe(0);
			expect(parsed!.parameter).toBe(0x24);
			expect(PatternEffectHandling.formatEffectAsString(parsed!)).toBe('6024');
		});

		it('effect 6 with table parses 6.T3', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('6.T3');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe(6);
			expect(parsed!.delay).toBe(0);
			expect(parsed!.tableIndex).toBe(2);
			expect(PatternEffectHandling.formatEffectAsString(parsed!)).toBe('60T3');
		});

		it('E1XY pulse width effect parses and formats', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('E102');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe('E'.charCodeAt(0));
			expect(parsed!.delay).toBe(1);
			expect(parsed!.parameter).toBe(0x02);
			expect(PatternEffectHandling.formatEffectAsString(parsed!)).toBe('E102');
		});

		it('E100 formats zero parameter as 00', () => {
			const effect = {
				effect: 'E'.charCodeAt(0),
				delay: 1,
				parameter: 0
			};
			expect(PatternEffectHandling.formatEffectAsString(effect)).toBe('E100');
			expect(PatternEffectHandling.formatEffectAsString(
				PatternEffectHandling.parseEffectFromString('E100')!
			)).toBe('E100');
		});

		it('E1TX pulse width table effect parses and formats', () => {
			const parsed = PatternEffectHandling.parseEffectFromString('E1T1');
			expect(parsed).not.toBeNull();
			expect(parsed!.effect).toBe('E'.charCodeAt(0));
			expect(parsed!.delay).toBe(1);
			expect(parsed!.parameter).toBe(0);
			expect(parsed!.tableIndex).toBe(0);
			expect(PatternEffectHandling.formatEffectAsString(parsed!)).toBe('E1T1');
		});

		it('E2XY and E3XY sweep effects parse and format', () => {
			const up = PatternEffectHandling.parseEffectFromString('E247');
			expect(up).not.toBeNull();
			expect(up!.delay).toBe(2);
			expect(up!.parameter).toBe(0x47);
			expect(PatternEffectHandling.formatEffectAsString(up!)).toBe('E247');

			const down = PatternEffectHandling.parseEffectFromString('E317');
			expect(down).not.toBeNull();
			expect(down!.delay).toBe(3);
			expect(down!.parameter).toBe(0x17);
			expect(PatternEffectHandling.formatEffectAsString(down!)).toBe('E317');
		});

		it('E2TX and E3TX sweep table effects parse and format', () => {
			const up = PatternEffectHandling.parseEffectFromString('E2T1');
			expect(up).not.toBeNull();
			expect(up!.delay).toBe(2);
			expect(up!.tableIndex).toBe(0);
			expect(PatternEffectHandling.formatEffectAsString(up!)).toBe('E2T1');

			const down = PatternEffectHandling.parseEffectFromString('E3T2');
			expect(down).not.toBeNull();
			expect(down!.delay).toBe(3);
			expect(down!.tableIndex).toBe(1);
			expect(PatternEffectHandling.formatEffectAsString(down!)).toBe('E3T2');
		});
	});
});
