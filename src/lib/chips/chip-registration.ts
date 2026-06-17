export const CHIP_TYPES = ['ay', 'nes'] as const;
export type ChipType = (typeof CHIP_TYPES)[number];
