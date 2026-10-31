import { SAAProcessor } from './processor';
import { SAAConverter } from './adapter';
import { SAAFormatter } from './formatter';
import { SAAChipRenderer } from './renderer';
import { SAA_CHIP_SCHEMA } from './schema';
import { SAA_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { describeSaaEffect, listSaaEffectStatusHints } from './effects';
import type { Chip } from '../types';

export const SAA_CHIP: Chip = {
	type: 'saa',
	name: 'SAA1099',
	wasmUrl: 'saa/saasound.wasm',
	audioSlotKind: SAA_AUDIO_SLOT_KIND,
	processorMap: (chip) => new SAAProcessor(chip),
	schema: SAA_CHIP_SCHEMA,
	createConverter: () => new SAAConverter(),
	createFormatter: () => new SAAFormatter(),
	createRenderer: () => new SAAChipRenderer(),
	describeEffect: describeSaaEffect,
	listEffectStatusHints: listSaaEffectStatusHints
};

export const CHIP = SAA_CHIP;
