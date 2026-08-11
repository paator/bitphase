import type { Instrument, Song } from '../../../models/song';
import { TAYM_CHIP_TYPE_AY } from './taym-spec';
import type { TaymChip, TaymTrack } from './taym-types';
import type { TaymTimerSegment } from './taym-timers';
import { importTaymAyChip } from './taym-ay';

export type TaymChipImportInput = {
	chip: TaymChip;
	chipIndex: number;
	track: TaymTrack;
	info: Record<string, string>;
	frameData: Uint8Array | null;
	segments: TaymTimerSegment[];
	instrumentIdOffset: number;
};

export type TaymChipImportResult = {
	song: Song;
	instruments: Instrument[];
	patternOrder: number[];
	loopPatternIndex: number;
	warnings: string[];
};

export type TaymChipImporter = (input: TaymChipImportInput) => TaymChipImportResult;

const CHIP_IMPORTERS = new Map<number, TaymChipImporter>([[TAYM_CHIP_TYPE_AY, importTaymAyChip]]);

export function getTaymChipImporter(chipTypeId: number): TaymChipImporter | null {
	return CHIP_IMPORTERS.get(chipTypeId) ?? null;
}
