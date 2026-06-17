import type { ChipProcessor } from './base/processor';
import type { ChipSchema } from './base/schema';
import type { PatternConverter } from './base/adapter';
import type { PatternFormatter } from './base/formatter-interface';
import type { ChipRenderer, ChipRendererBinding } from './base/renderer';
import type { ResourceLoader } from './base/resource-loader';
import type { Component } from 'svelte';
import type { ChipPlaybackDebugSpec } from './base/playback-debug';

import type { Instrument } from '../../models/song';

export interface Chip {
	type: string;
	name: string;
	wasmUrl: string;
	audioSlotKind: string;
	processorMap: (chip: Chip) => ChipProcessor;
	schema: ChipSchema;
	createConverter: () => PatternConverter;
	createFormatter: () => PatternFormatter;
	createRenderer: (loader?: ResourceLoader, binding?: ChipRendererBinding) => ChipRenderer;
	instrumentEditor?: Component<any>;
	previewRow?: Component<any>;
	playbackDebug?: ChipPlaybackDebugSpec;
	copyInstrumentFields?: (source: Instrument, target: Instrument) => void;
}
