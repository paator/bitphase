import { NES_CHIP as NES_CHIP_CORE } from './core';
import NESInstrumentEditor from './NESInstrumentEditor.svelte';

export const NES_CHIP = {
	...NES_CHIP_CORE,
	instrumentEditor: NESInstrumentEditor
} as const;

export { NESProcessor } from './processor';
export { NESConverter } from './adapter';
export { NESFormatter } from './formatter';
export { NESChipRenderer } from './renderer';
export { NESInstrumentEditor };
export { NES_CHIP_SCHEMA } from './schema';
