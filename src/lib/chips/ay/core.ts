import { AYProcessor } from './processor';
import { AYConverter } from './adapter';
import { AYFormatter } from './formatter';
import { AYChipRenderer } from './renderer';
import { AY_CHIP_SCHEMA } from './schema';
import { AYUMI_AUDIO_SLOT_KIND } from './audio-slot-kind';
import { AY_PLAYBACK_DEBUG } from './playback-debug';
import { copyAyInstrumentFields } from './instrument';
import type { Chip } from '../types';

export const AY_CHIP: Chip = {
	type: 'ay',
	name: 'AY-3-8910 / YM2149F',
	wasmUrl: 'ay/ayumi.wasm',
	audioSlotKind: AYUMI_AUDIO_SLOT_KIND,
	processorMap: (chip) => new AYProcessor(chip),
	schema: AY_CHIP_SCHEMA,
	createConverter: () => new AYConverter(),
	createFormatter: () => new AYFormatter(),
	createRenderer: (loader, binding) => new AYChipRenderer(loader, binding),
	instrumentEditor: undefined,
	previewRow: undefined,
	playbackDebug: AY_PLAYBACK_DEBUG,
	copyInstrumentFields: copyAyInstrumentFields
};

export const CHIP = AY_CHIP;
