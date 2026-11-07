import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import {
	clipboardAllowsNoteEnvelopeConversion,
	clipboardFieldsAreCompatible,
	minClipboardChannelIndex,
	resolveClipboardDestChannelIndex,
	resolveClipboardDestFieldKey,
	resolveClipboardDestGlobalFieldKey
} from '@/lib/services/pattern/clipboard-field-mapping';

describe('clipboard field mapping', () => {
	it('converts envelope and note only for a single-field clipboard', () => {
		expect(clipboardAllowsNoteEnvelopeConversion(['envelopeValue'])).toBe(true);
		expect(clipboardAllowsNoteEnvelopeConversion(['note'])).toBe(true);
		expect(clipboardAllowsNoteEnvelopeConversion(['envelopeValue', 'envelopeValue'])).toBe(
			true
		);
		expect(clipboardAllowsNoteEnvelopeConversion(['note', 'volume'])).toBe(false);
	});

	it('maps source channels relative to the paste origin channel', () => {
		expect(resolveClipboardDestChannelIndex(0, 1, 0)).toBe(1);
		expect(resolveClipboardDestChannelIndex(1, 1, 0)).toBe(2);
		expect(resolveClipboardDestChannelIndex(1, 0, 1)).toBe(0);
		expect(resolveClipboardDestChannelIndex(-1, 0, 0)).toBe(-1);
	});

	it('keeps unique fields on their own key', () => {
		expect(resolveClipboardDestFieldKey('volume', 'note', ['volume'])).toBe('volume');
		expect(resolveClipboardDestFieldKey('table', 'effect', ['table', 'volume'])).toBe('table');
	});

	it('shifts effect slots relative to the paste cursor', () => {
		expect(resolveClipboardDestFieldKey('effect', 'effect1', ['effect'])).toBe('effect1');
		expect(resolveClipboardDestFieldKey('effect', 'effect1', ['effect', 'effect1'])).toBe(
			'effect1'
		);
		expect(resolveClipboardDestFieldKey('effect1', 'effect1', ['effect', 'effect1'])).toBe(
			'effect2'
		);
		expect(resolveClipboardDestFieldKey('effect', 'note', ['effect'])).toBe('effect');
	});

	it('ignores global fields when finding the first source channel', () => {
		expect(minClipboardChannelIndex([-1, 2, 1])).toBe(1);
		expect(minClipboardChannelIndex([undefined, -1])).toBe(0);
	});

	it('moves an SAA envelope with the channel group it was copied from', () => {
		const keys = ['note', 'env1', 'note'];
		expect(
			resolveClipboardDestGlobalFieldKey('env1', SAA_CHIP_SCHEMA, 'note', 0, 4, keys)
		).toBe('env0');
		expect(
			resolveClipboardDestGlobalFieldKey('env1', SAA_CHIP_SCHEMA, 'note', 3, 4, keys)
		).toBe('env1');
		expect(
			resolveClipboardDestGlobalFieldKey('noise1', SAA_CHIP_SCHEMA, 'note', 0, 4, keys)
		).toBe('noise0');
		expect(
			resolveClipboardDestGlobalFieldKey('env0', SAA_CHIP_SCHEMA, 'note', 3, 0, ['env0'])
		).toBe('env1');
		expect(
			resolveClipboardDestGlobalFieldKey('env1', SAA_CHIP_SCHEMA, 'note', 0, 0, keys)
		).toBe('env1');
	});

	it('lands an envelope on the envelope column under the cursor', () => {
		expect(
			resolveClipboardDestGlobalFieldKey('env1', SAA_CHIP_SCHEMA, 'env0', -1, 4, ['env1'])
		).toBe('env0');
		expect(
			resolveClipboardDestGlobalFieldKey('env1', SAA_CHIP_SCHEMA, 'env1', -1, 4, [
				'env0',
				'env1'
			])
		).toBe('env1');
	});

	it('leaves unrelated global fields on their own key', () => {
		expect(
			resolveClipboardDestGlobalFieldKey('envelopeValue', AY_CHIP_SCHEMA, 'note', 0, 0, [
				'envelopeValue'
			])
		).toBe('envelopeValue');
		expect(clipboardFieldsAreCompatible('env1', 'env0', SAA_CHIP_SCHEMA)).toBe(true);
		expect(clipboardFieldsAreCompatible('env1', 'noise0', SAA_CHIP_SCHEMA)).toBe(false);
		expect(clipboardFieldsAreCompatible('envelopeValue', 'noiseValue', AY_CHIP_SCHEMA)).toBe(
			false
		);
	});
});
