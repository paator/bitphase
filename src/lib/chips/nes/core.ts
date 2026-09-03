import { NESProcessor } from './processor';
import { NESConverter } from './adapter';
import { NESFormatter } from './formatter';
import { NESChipRenderer } from './renderer';
import { NES_CHIP_SCHEMA } from './schema';
import { NES_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { NES_PLAYBACK_DEBUG } from './playback-debug';
import { copyNesInstrumentFields } from './instrument';
import { describeNesEffect } from './effects';
import type { Chip } from '../types';

export const NES_CHIP: Chip = {
	type: 'nes',
	name: '2A03 / 2A07',
	wasmUrl: 'nes/nes_apu.wasm',
	audioSlotKind: NES_AUDIO_SLOT_KIND,
	processorMap: (chip) => new NESProcessor(chip),
	schema: NES_CHIP_SCHEMA,
	createConverter: () => new NESConverter(),
	createFormatter: () => new NESFormatter(),
	createRenderer: (loader, binding) => new NESChipRenderer(loader, binding),
	instrumentEditor: undefined,
	previewRow: undefined,
	playbackDebug: NES_PLAYBACK_DEBUG,
	copyInstrumentFields: copyNesInstrumentFields,
	describeEffect: describeNesEffect
};

export const CHIP = NES_CHIP;
