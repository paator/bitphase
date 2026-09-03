import { describe, expect, it } from 'vitest';
import {
	groupInstrumentMacroFields,
	instrumentRowsToMacros,
	macrosToInstrumentRows,
	macroValueToNormalized,
	normalizedToMacroValue,
	resolveInstrumentMacros,
	sampleInstrumentMacroIndex,
	sampleInstrumentRowFromMacros,
	setInstrumentMacroLoop,
	setInstrumentMacroValue
} from '@/lib/chips/base/instrument-macros';
import { AY_MIXER_MACRO_FIELDS } from '@/lib/chips/ay/mixer-macros';
import { NES_APU_MACRO_FIELDS } from '@/lib/chips/nes/apu-macros';

describe('sampleInstrumentMacroIndex', () => {
	it('plays the sequence then wraps to the loop point', () => {
		expect(sampleInstrumentMacroIndex(0, 4, 2)).toBe(0);
		expect(sampleInstrumentMacroIndex(3, 4, 2)).toBe(3);
		expect(sampleInstrumentMacroIndex(4, 4, 2)).toBe(2);
		expect(sampleInstrumentMacroIndex(5, 4, 2)).toBe(3);
		expect(sampleInstrumentMacroIndex(6, 4, 2)).toBe(2);
	});

	it('wraps to the start when loop is 0', () => {
		expect(sampleInstrumentMacroIndex(4, 4, 0)).toBe(0);
		expect(sampleInstrumentMacroIndex(5, 4, 0)).toBe(1);
	});
});

describe('instrument row macro conversion', () => {
	it('turns shared rows into independent macros with the same loop', () => {
		const macros = instrumentRowsToMacros(
			[
				{ tone: true, volume: 15, noise: false },
				{ tone: true, volume: 8, noise: true }
			],
			1,
			AY_MIXER_MACRO_FIELDS
		);
		expect(macros.volume?.values).toEqual([15, 8]);
		expect(macros.volume?.loop).toBe(1);
		expect(macros.noise?.values).toEqual([false, true]);
		expect(macros.tone?.loop).toBe(1);
	});

	it('keeps amplitude slide as an independent enum macro', () => {
		const macros = instrumentRowsToMacros(
			[
				{ amplitudeSliding: true, amplitudeSlideUp: true, volume: 15 },
				{ amplitudeSliding: true, amplitudeSlideUp: false, volume: 14 },
				{ amplitudeSliding: false, volume: 13 }
			],
			0,
			AY_MIXER_MACRO_FIELDS
		);
		expect(macros.amplitudeSlide?.values).toEqual([1, -1, 0]);
		const rows = macrosToInstrumentRows(macros, AY_MIXER_MACRO_FIELDS);
		expect(rows[0]?.amplitudeSliding).toBe(true);
		expect(rows[0]?.amplitudeSlideUp).toBe(true);
		expect(rows[1]?.amplitudeSlideUp).toBe(false);
		expect(rows[2]?.amplitudeSliding).toBe(false);
	});

	it('samples volume and tone offset on separate loops', () => {
		const macros = resolveInstrumentMacros(
			{
				macros: {
					volume: { values: [15, 8], loop: 0 },
					toneAdd: { values: [0, 1, 2, 3], loop: 2 }
				}
			},
			AY_MIXER_MACRO_FIELDS
		);
		expect(sampleInstrumentRowFromMacros(macros, 0, AY_MIXER_MACRO_FIELDS).volume).toBe(15);
		expect(sampleInstrumentRowFromMacros(macros, 0, AY_MIXER_MACRO_FIELDS).toneAdd).toBe(0);
		expect(sampleInstrumentRowFromMacros(macros, 2, AY_MIXER_MACRO_FIELDS).volume).toBe(15);
		expect(sampleInstrumentRowFromMacros(macros, 2, AY_MIXER_MACRO_FIELDS).toneAdd).toBe(2);
		expect(sampleInstrumentRowFromMacros(macros, 3, AY_MIXER_MACRO_FIELDS).volume).toBe(8);
		expect(sampleInstrumentRowFromMacros(macros, 3, AY_MIXER_MACRO_FIELDS).toneAdd).toBe(3);
		expect(sampleInstrumentRowFromMacros(macros, 4, AY_MIXER_MACRO_FIELDS).toneAdd).toBe(2);
	});

	it('maps amplitude slide draw height from down to up', () => {
		const field = AY_MIXER_MACRO_FIELDS.find((item) => item.id === 'amplitudeSlide')!;
		expect(macroValueToNormalized(-1, field)).toBe(0);
		expect(macroValueToNormalized(0, field)).toBe(0.5);
		expect(macroValueToNormalized(1, field)).toBe(1);
		expect(normalizedToMacroValue(0, field)).toBe(-1);
		expect(normalizedToMacroValue(0.5, field)).toBe(0);
		expect(normalizedToMacroValue(1, field)).toBe(1);
	});

	it('aligns waveform mixer macros to one length and loop', () => {
		const macros = resolveInstrumentMacros(
			{
				macros: {
					tone: { values: [true, true, false, true], loop: 2 },
					noise: { values: [false], loop: 0 },
					envelope: { values: [false, true], loop: 1 }
				}
			},
			AY_MIXER_MACRO_FIELDS
		);
		expect(macros.tone?.values).toEqual([true, true, false, true]);
		expect(macros.noise?.values).toEqual([false, false, false, false]);
		expect(macros.envelope?.values).toEqual([false, true, true, true]);
		expect(macros.tone?.loop).toBe(2);
		expect(macros.noise?.loop).toBe(2);
		expect(macros.envelope?.loop).toBe(2);
		expect(sampleInstrumentRowFromMacros(macros, 5, AY_MIXER_MACRO_FIELDS).tone).toBe(true);
		expect(sampleInstrumentRowFromMacros(macros, 5, AY_MIXER_MACRO_FIELDS).noise).toBe(false);
	});

	it('aligns volume and amplitude slide to one length and loop', () => {
		const macros = resolveInstrumentMacros(
			{
				macros: {
					volume: { values: [15, 12, 8], loop: 1 },
					amplitudeSlide: { values: [0], loop: 0 }
				}
			},
			AY_MIXER_MACRO_FIELDS
		);
		expect(macros.volume?.values).toEqual([15, 12, 8]);
		expect(macros.amplitudeSlide?.values).toEqual([0, 0, 0]);
		expect(macros.volume?.loop).toBe(1);
		expect(macros.amplitudeSlide?.loop).toBe(1);
	});

	it('aligns tone, noise, and envelope parameter macros within each group', () => {
		const macros = resolveInstrumentMacros(
			{
				macros: {
					toneAdd: { values: [0, 12, -4], loop: 1 },
					toneAccumulation: { values: [false], loop: 0 },
					noiseAdd: { values: [1], loop: 0 },
					noiseAccumulation: { values: [true, false], loop: 0 },
					retriggerEnvelope: { values: [true], loop: 0 },
					envelopeAdd: { values: [0, 8], loop: 1 },
					envelopeAccumulation: { values: [false], loop: 0 }
				}
			},
			AY_MIXER_MACRO_FIELDS
		);
		expect(macros.toneAdd?.values).toEqual([0, 12, -4]);
		expect(macros.toneAccumulation?.values).toEqual([false, false, false]);
		expect(macros.toneAdd?.loop).toBe(1);
		expect(macros.toneAccumulation?.loop).toBe(1);
		expect(macros.noiseAdd?.values).toEqual([1, 1]);
		expect(macros.noiseAccumulation?.values).toEqual([true, false]);
		expect(macros.noiseAdd?.loop).toBe(0);
		expect(macros.envelopeAdd?.values).toEqual([0, 8]);
		expect(macros.envelopeAccumulation?.values).toEqual([false, false]);
		expect(macros.envelopeAdd?.loop).toBe(1);
		expect(macros.retriggerEnvelope?.values).toEqual([true]);
		expect(macros.retriggerEnvelope?.loop).toBe(0);
	});

	it('updates a single NES macro without changing the others', () => {
		const macros = instrumentRowsToMacros(
			[{ pulseWidth: 2, volumeOrRate: 15, retrigger: false }],
			0,
			NES_APU_MACRO_FIELDS
		);
		const volumeField = NES_APU_MACRO_FIELDS.find((item) => item.id === 'volumeOrRate')!;
		const volume = setInstrumentMacroValue(macros.volumeOrRate!, volumeField, 0, 7);
		const retrigger = setInstrumentMacroLoop({ values: [false, true], loop: 0 }, 1);
		expect(volume.values[0]).toBe(7);
		expect(retrigger.loop).toBe(1);
		expect(macros.pulseWidth?.values[0]).toBe(2);
	});
});

describe('groupInstrumentMacroFields', () => {
	it('keeps a single-field shared sequence when the field opts in', () => {
		const groups = groupInstrumentMacroFields([
			{
				id: 'retriggerEnvelope',
				label: 'Retrigger',
				title: 'Retrigger',
				kind: 'boolean',
				group: 'Envelope retrigger',
				shareSequence: true,
				defaultValue: false
			}
		]);
		expect(groups).toEqual([
			{
				id: 'Envelope retrigger',
				label: 'Envelope retrigger',
				fields: expect.any(Array),
				shareSequence: true
			}
		]);
		expect(groups[0]?.fields.map((field) => field.id)).toEqual(['retriggerEnvelope']);
	});

	it('keeps ungrouped fields as their own groups', () => {
		const groups = groupInstrumentMacroFields([
			{
				id: 'volume',
				label: 'Volume',
				title: 'Volume',
				kind: 'integer',
				defaultValue: 15
			},
			{
				id: 'tone',
				label: 'Tone',
				title: 'Tone',
				kind: 'boolean',
				defaultValue: true
			}
		]);
		expect(groups.map((group) => group.fields.map((field) => field.id))).toEqual([
			['volume'],
			['tone']
		]);
	});

	it('clusters waveform mixers separately from offset and accumulation pairs', () => {
		expect(
			groupInstrumentMacroFields(AY_MIXER_MACRO_FIELDS).map((group) => [
				group.label,
				group.fields.map((field) => field.id)
			])
		).toEqual([
			['Volume', ['volume', 'amplitudeSlide']],
			['Waveform', ['tone', 'noise', 'envelope']],
			['Tone parameters', ['toneAdd', 'toneAccumulation']],
			['Noise parameters', ['noiseAdd', 'noiseAccumulation']],
			['Envelope parameters', ['envelopeAdd', 'envelopeAccumulation']],
			['Envelope retrigger', ['retriggerEnvelope']]
		]);
		expect(
			groupInstrumentMacroFields(NES_APU_MACRO_FIELDS).map((group) => [
				group.label,
				group.fields.map((field) => field.id)
			])
		).toEqual([
			['Volume', ['volumeOrRate', 'envelope', 'retrigger']],
			['Waveform', ['pulseWidth']],
			['Tone parameters', ['toneAdd', 'toneAccumulation']],
			['Sweep', ['sweep', 'sweepRate', 'sweepShift']],
			['Sound length', ['soundLength']]
		]);
	});

	it('marks AY mixer groups as shared sequences', () => {
		const groups = groupInstrumentMacroFields(AY_MIXER_MACRO_FIELDS);
		expect(groups.find((group) => group.label === 'Waveform')?.shareSequence).toBe(true);
		expect(groups.find((group) => group.label === 'Volume')?.shareSequence).toBe(true);
		expect(groups.find((group) => group.label === 'Tone parameters')?.shareSequence).toBe(
			true
		);
		expect(groups.find((group) => group.label === 'Noise parameters')?.shareSequence).toBe(
			true
		);
		expect(groups.find((group) => group.label === 'Envelope parameters')?.shareSequence).toBe(
			true
		);
		expect(groups.find((group) => group.label === 'Envelope retrigger')?.shareSequence).toBe(
			true
		);
	});

	it('keeps NES APU macros on independent sequences', () => {
		expect(
			groupInstrumentMacroFields(NES_APU_MACRO_FIELDS).every((group) => !group.shareSequence)
		).toBe(true);
	});
});
