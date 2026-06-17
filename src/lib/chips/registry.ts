import type { Chip } from './types';
import type { ResourceLoader } from './base/resource-loader';
import type { ChipType } from './chip-registration';
import { AY_CHIP } from './ay';
import { NES_CHIP } from './nes';

const CHIPS = {
	ay: AY_CHIP,
	nes: NES_CHIP
} satisfies Record<ChipType, Chip>;

export function getChipByType(chipType: string): Chip | null {
	if (!(chipType in CHIPS)) return null;
	return CHIPS[chipType as ChipType];
}

export function getAllChips(): Chip[] {
	return Object.values(CHIPS);
}

export function getConverter(chip: Chip) {
	return chip.createConverter();
}

export function getFormatter(chip: Chip) {
	return chip.createFormatter();
}

export function createRenderer(chip: Chip, loader?: ResourceLoader) {
	return chip.createRenderer(loader, { chipType: chip.type, audioSlotKind: chip.audioSlotKind });
}
