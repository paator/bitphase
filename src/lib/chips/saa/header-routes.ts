import { saaEnvelopeByteFromCode } from '../../../../public/saa/saa-levels.js';
import type { ChannelHeaderRoute } from '../base/header-route';
import {
	getHardwareChannelIndex,
	logicalColumnForHardwareChannel
} from '../../models/virtual-channels';

const CHIP_EFFECT = 'E'.charCodeAt(0);
const NOISE_LOCK_SUBCOMMAND = 2;
const MIXER_SUBCOMMAND = 6;
const MIXER_FOLLOW_INSTRUMENT = 4;
const NOISE_LABELS = ['high', 'mid', 'low'] as const;

const GROUPS = [
	{ driver: 0, clock: 1, voice: 2, noiseKey: 'noise0', envelopeKey: 'env0' },
	{ driver: 3, clock: 4, voice: 5, noiseKey: 'noise1', envelopeKey: 'env1' }
] as const;

export interface SaaHeaderRoutePattern {
	id: number;
	length: number;
	patternRows: ReadonlyArray<{
		noise0?: unknown;
		noise1?: unknown;
		env0?: unknown;
		env1?: unknown;
	}>;
	channels: ReadonlyArray<{
		rows: ReadonlyArray<{
			instrument?: unknown;
			effects?: ReadonlyArray<{
				effect?: number;
				delay?: number;
				parameter?: number;
				tableIndex?: number;
			} | null>;
		}>;
	}>;
}

export interface SaaHeaderRouteInstrument {
	id: string;
	macros?: {
		noise?: { values?: readonly unknown[] };
	};
}

export function saaHeaderRoutes(input: {
	patterns: readonly SaaHeaderRoutePattern[];
	patternOrder: readonly number[];
	orderIndex: number;
	row: number;
	virtualChannelMap?: Record<number, number>;
	hardwareLabels?: readonly string[];
	instruments?: readonly SaaHeaderRouteInstrument[];
}): ChannelHeaderRoute[] {
	const labels = input.hardwareLabels ?? ['A', 'B', 'C', 'D', 'E', 'F'];
	const map = input.virtualChannelMap ?? {};
	const byNumber = new Map<number, SaaHeaderRouteInstrument>();
	for (const instrument of input.instruments ?? []) {
		const number = parseInt(instrument.id, 36);
		if (Number.isFinite(number)) byNumber.set(number, instrument);
	}
	const heard = hearSaaRouting(
		input.patterns,
		input.patternOrder,
		input.orderIndex,
		input.row,
		labels,
		map
	);
	const channelCount = heard.channelCount;
	const column = (hardware: number) =>
		logicalColumnForHardwareChannel(hardware, map, labels.length);
	const noiseUsers = hardwareUsingNoise(heard, labels, map, byNumber);
	const routes: ChannelHeaderRoute[] = [];

	for (const group of GROUPS) {
		const clock = heard.noiseLock[group.driver < 3 ? 0 : 1]
			? 3
			: heard.noiseClock[group.driver < 3 ? 0 : 1];
		const users = [group.driver, group.clock, group.voice].filter((hardware) =>
			noiseUsers.has(hardware)
		);
		if (clock === 3) {
			const fromIndex = column(group.driver);
			const targets = users
				.filter((hardware) => hardware !== group.driver)
				.map(column)
				.filter((index) => index >= 0 && index < channelCount && index !== fromIndex);
			if (fromIndex >= 0 && fromIndex < channelCount && targets.length > 0) {
				routes.push({
					fromIndex,
					toIndices: targets,
					label: 'noise',
					tone: 'noise',
					lane: 1,
					arrow: true
				});
			}
		} else if (users.length > 0 && clock >= 0 && clock <= 2) {
			const columns = users.map(column).filter((index) => index >= 0 && index < channelCount);
			if (columns.length > 0) {
				routes.push({
					fromIndex: columns[0]!,
					toIndices: columns,
					label: NOISE_LABELS[clock]!,
					tone: 'noise',
					lane: 1,
					arrow: false
				});
			}
		}

		if (!heard.envelopeOn[group.driver < 3 ? 0 : 1]) continue;
		const fromIndex = column(group.clock);
		const toIndex = column(group.voice);
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= channelCount || toIndex >= channelCount) {
			continue;
		}
		routes.push({
			fromIndex,
			toIndices: [toIndex],
			label: 'env',
			tone: 'envelope',
			lane: 0,
			arrow: true
		});
	}

	return routes;
}

interface HeardRouting {
	channelCount: number;
	noiseClock: [number, number];
	noiseLock: [boolean, boolean];
	envelopeOn: [boolean, boolean];
	instrument: Array<number | null>;
	mixer: Array<number | null>;
}

function hearSaaRouting(
	patterns: readonly SaaHeaderRoutePattern[],
	patternOrder: readonly number[],
	orderIndex: number,
	row: number,
	labels: readonly string[],
	map: Record<number, number>
): HeardRouting {
	const heard: HeardRouting = {
		channelCount: 0,
		noiseClock: [0, 0],
		noiseLock: [false, false],
		envelopeOn: [false, false],
		instrument: [],
		mixer: []
	};
	const lastOrder = Math.min(Math.max(orderIndex, 0), Math.max(0, patternOrder.length - 1));
	for (let order = 0; order <= lastOrder && order < patternOrder.length; order++) {
		const pattern = patterns.find((item) => item.id === patternOrder[order]);
		if (!pattern) continue;
		heard.channelCount = pattern.channels.length;
		while (heard.instrument.length < pattern.channels.length) {
			heard.instrument.push(null);
			heard.mixer.push(null);
		}
		const lastRow =
			order === lastOrder
				? Math.min(Math.max(row, 0), Math.max(0, pattern.length - 1))
				: pattern.length - 1;
		for (let index = 0; index <= lastRow; index++) {
			const patternRow = pattern.patternRows[index];
			applyNoise(heard.noiseClock, 0, patternRow?.noise0);
			applyNoise(heard.noiseClock, 1, patternRow?.noise1);
			applyEnvelope(heard.envelopeOn, 0, patternRow?.env0);
			applyEnvelope(heard.envelopeOn, 1, patternRow?.env1);
			for (let channel = 0; channel < pattern.channels.length; channel++) {
				const channelRow = pattern.channels[channel]?.rows[index];
				if (!channelRow) continue;
				if (typeof channelRow.instrument === 'number' && channelRow.instrument > 0) {
					heard.instrument[channel] = channelRow.instrument;
				}
				applyChannelEffects(
					heard,
					channel,
					getHardwareChannelIndex(channel, [...labels], map),
					channelRow.effects
				);
			}
		}
	}
	return heard;
}

function applyNoise(clocks: [number, number], group: number, raw: unknown): void {
	if (raw === -1) {
		clocks[group] = 0;
		return;
	}
	if (typeof raw === 'number' && raw > 0) clocks[group] = raw & 3;
}

function applyEnvelope(enabled: [boolean, boolean], group: number, raw: unknown): void {
	if (typeof raw !== 'number' || raw === 0) return;
	if (raw === -1) {
		enabled[group] = false;
		return;
	}
	const byte = saaEnvelopeByteFromCode(raw);
	if (byte == null) return;
	enabled[group] = (byte & 0x80) !== 0;
}

function applyChannelEffects(
	heard: HeardRouting,
	channel: number,
	hardware: number,
	effects: SaaHeaderRoutePattern['channels'][number]['rows'][number]['effects']
): void {
	if (!effects || hardware < 0) return;
	const group = hardware < 3 ? 0 : 1;
	for (const effect of effects) {
		if (!effect || effect.effect !== CHIP_EFFECT || effect.tableIndex != null) continue;
		if (effect.delay === NOISE_LOCK_SUBCOMMAND) {
			heard.noiseLock[group] = ((effect.parameter ?? 0) & 1) !== 0;
		} else if (effect.delay === MIXER_SUBCOMMAND) {
			const parameter = effect.parameter ?? 0;
			heard.mixer[channel] = parameter >= MIXER_FOLLOW_INSTRUMENT ? null : parameter;
		}
	}
}

function hardwareUsingNoise(
	heard: HeardRouting,
	labels: readonly string[],
	map: Record<number, number>,
	instruments: Map<number, SaaHeaderRouteInstrument>
): Set<number> {
	const users = new Set<number>();
	for (let channel = 0; channel < heard.channelCount; channel++) {
		const hardware = getHardwareChannelIndex(channel, [...labels], map);
		if (hardware < 0) continue;
		const mask = heard.mixer[channel];
		if (mask !== null && mask < MIXER_FOLLOW_INSTRUMENT) {
			if ((mask & 2) !== 0) users.add(hardware);
			continue;
		}
		const instrument = instruments.get(heard.instrument[channel] ?? -1);
		const values = instrument?.macros?.noise?.values;
		if (values?.some((value) => value === true)) users.add(hardware);
	}
	return users;
}
