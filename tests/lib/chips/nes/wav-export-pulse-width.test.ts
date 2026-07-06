import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemResourceLoader } from '../../../../cli/resource-loader-node';
import { NESChipRenderer } from '@/lib/chips/nes/renderer';
import { NES_CHIP_SCHEMA, NES_DEFAULT_TUNING_TABLE } from '@/lib/chips/nes/schema';
import { Project, Table } from '@/lib/models/project';
import { Effect, Instrument, Note, NoteName, Pattern, Song } from '@/lib/models/song';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SAMPLE_RATE = 44100;

type ExportLane = {
	state: {
		currentPattern: Pattern;
		timeline: {
			tickAccumulator: number;
			tickStep: number;
			currentTick: number;
			currentRow: number;
			advancePosition: () => boolean;
		};
	};
	audioDriver: {
		processInstruments: (state: unknown, registerState: unknown) => void;
		advancePulseWidthTable: (state: unknown) => void;
	};
	registerState: { channels: Array<{ duty: number }> };
	patternProcessor: {
		parsePatternRow: (pattern: Pattern, rowIndex: number, registerState: unknown) => void;
		processSpeedTable: () => void;
		processTables: () => void;
		processArpeggio: () => void;
		processEffectTables: () => void;
		processVibrato: () => void;
		processSlides: () => void;
	};
	engine: { dispose: () => void };
	apuPtr: number;
	dmcPtr: number;
	wasm: Record<string, unknown>;
};

async function createExportLane(project: Project, pattern: Pattern): Promise<ExportLane> {
	const loader = new FileSystemResourceLoader(PUBLIC_DIR);
	const wasmBuffer = await loader.loadWasm('nes/nes_apu.wasm');
	const result = await WebAssembly.instantiate(wasmBuffer, {
		env: { emscripten_notify_memory_growth: () => {} }
	});
	const wasm = result.instance.exports as Record<string, unknown>;

	const { default: NesState } = await loader.loadModule<{ default: new () => ExportLane['state'] }>(
		'nes/nes-state.js'
	);
	const { default: TrackerPatternProcessor } = await loader.loadModule<{
		default: new (
			state: unknown,
			driver: unknown,
			port: { postMessage: () => void }
		) => ExportLane['patternProcessor'];
	}>('tracker/tracker-pattern-processor.js');
	const { default: NesAudioDriver } = await loader.loadModule<{
		default: new () => ExportLane['audioDriver'];
	}>('nes/nes-audio-driver.js');
	const { createNesApuEngine } = await loader.loadModule<{
		createNesApuEngine: (wasm: Record<string, unknown>) => {
			engine: ExportLane['engine'];
			apuPtr: number;
			dmcPtr: number;
		};
	}>('nes/nes-apu-engine.js');
	const { default: NesChipRegisterState } = await loader.loadModule<{
		default: new () => ExportLane['registerState'];
	}>('nes/nes-chip-register-state.js');

	const song = project.songs[0]!;
	const { engine, apuPtr, dmcPtr } = createNesApuEngine(wasm);
	const state = new NesState() as ExportLane['state'] & {
		setWasmModule: (...args: unknown[]) => void;
		setCpuFrequency: (frequency: number) => void;
		setChipVariant: (variant: string) => void;
		setTuningTable: (table: number[]) => void;
		setInstruments: (instruments: unknown[]) => void;
		setTables: (tables: unknown[]) => void;
		setIntFrequency: (frequency: number, sampleRate: number) => void;
		setPatternOrder: (order: number[], loopPointId: number) => void;
		setSpeed: (speed: number) => void;
		updateSamplesPerTick: (sampleRate: number) => void;
	};

	state.setWasmModule(wasm, apuPtr, dmcPtr, wasmBuffer);
	state.setCpuFrequency(song.chipFrequency ?? 1_789_773);
	state.setChipVariant('NTSC');
	state.setTuningTable(song.tuningTable);
	state.setInstruments(project.instruments);
	state.setTables(project.tables);
	state.setIntFrequency(song.interruptFrequency ?? 50, SAMPLE_RATE);
	state.setPatternOrder(project.patternOrder, project.loopPointId);
	state.setSpeed(song.initialSpeed ?? 6);
	state.updateSamplesPerTick(SAMPLE_RATE);

	const audioDriver = new NesAudioDriver();
	const registerState = new NesChipRegisterState();
	const patternProcessor = new TrackerPatternProcessor(state, audioDriver, {
		postMessage: () => {}
	});
	engine.applyRegisterState(registerState);

	state.currentPattern = pattern;
	state.timeline.tickAccumulator = 1.0;

	return {
		state,
		audioDriver,
		registerState,
		patternProcessor,
		engine,
		apuPtr,
		dmcPtr,
		wasm
	};
}

function runWavExportTicks(lane: ExportLane, tickCount: number): number[] {
	const duties: number[] = [];
	const { state, patternProcessor, audioDriver, registerState } = lane;

	for (let processed = 0; processed < tickCount; ) {
		const tl = state.timeline;
		tl.tickAccumulator += tl.tickStep;

		if (tl.tickAccumulator >= 1.0) {
			if (tl.currentTick === 0 && state.currentPattern) {
				patternProcessor.parsePatternRow(
					state.currentPattern,
					tl.currentRow,
					registerState
				);
				patternProcessor.processSpeedTable();
			}

			patternProcessor.processTables();
			patternProcessor.processArpeggio();
			patternProcessor.processEffectTables();
			audioDriver.processInstruments(state, registerState);
			duties.push(registerState.channels[0].duty);
			audioDriver.advancePulseWidthTable(state);
			patternProcessor.processVibrato();
			patternProcessor.processSlides();

			state.timeline.advancePosition();
			tl.tickAccumulator -= 1.0;
			processed++;
		}
	}

	return duties;
}

function createBaseSong(pattern: Pattern): Song {
	const song = new Song();
	song.chipType = 'nes';
	song.tuningTable = NES_DEFAULT_TUNING_TABLE;
	song.chipFrequency = 1_789_773;
	song.initialSpeed = 6;
	song.interruptFrequency = 50;
	song.patterns = [pattern];
	return song;
}

describe('NES WAV export pulse width', () => {
	it('keeps fixed pulse width from E1XY across export ticks', async () => {
		const pattern = new Pattern(0, 8, NES_CHIP_SCHEMA);
		pattern.channels[0].rows[0].note = new Note(NoteName.C, 1);
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[0].rows[0].effects = [
			new Effect('E'.charCodeAt(0), 1, 0x02)
		];

		const instrument = new Instrument(
			'01',
			[{ pulseWidth: 0, retrigger: false }],
			0,
			'Pulse',
			'nes'
		);
		const project = new Project('E1XY export', '', [createBaseSong(pattern)], 0, [0], [], {}, [
			instrument
		]);

		const lane = await createExportLane(project, pattern);
		try {
			const duties = runWavExportTicks(lane, 4);
			expect(duties).toEqual([2, 2, 2, 2]);
		} finally {
			lane.engine.dispose();
		}
	});

	it('automates pulse width from E1TX table each export tick', async () => {
		const pattern = new Pattern(0, 8, NES_CHIP_SCHEMA);
		pattern.channels[0].rows[0].note = new Note(NoteName.C, 1);
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[0].rows[0].effects = [
			new Effect('E'.charCodeAt(0), 1, 0, 0)
		];

		const instrument = new Instrument(
			'01',
			[{ pulseWidth: 3, retrigger: false }],
			0,
			'Pulse',
			'nes'
		);
		const pwmTable = new Table(0, [0, 2, 3], 1, 'PWM');
		const project = new Project(
			'E1TX export',
			'',
			[createBaseSong(pattern)],
			0,
			[0],
			[pwmTable],
			{},
			[instrument]
		);

		const lane = await createExportLane(project, pattern);
		try {
			const duties = runWavExportTicks(lane, 4);
			expect(duties).toEqual([0, 2, 3, 2]);
		} finally {
			lane.engine.dispose();
		}
	});

	it('renders stereo audio with E1 pulse width effects', async () => {
		const pattern = new Pattern(0, 8, NES_CHIP_SCHEMA);
		pattern.channels[0].rows[0].note = new Note(NoteName.C, 1);
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[0].rows[0].effects = [
			new Effect('E'.charCodeAt(0), 1, 0, 0)
		];

		const instrument = new Instrument(
			'01',
			[{ pulseWidth: 2, retrigger: false }],
			0,
			'Pulse',
			'nes'
		);
		const pwmTable = new Table(0, [0, 1, 2, 3], 0, 'PWM');
		const project = new Project(
			'E1 render',
			'',
			[createBaseSong(pattern)],
			0,
			[0],
			[pwmTable],
			{},
			[instrument]
		);

		const renderer = new NESChipRenderer(new FileSystemResourceLoader(PUBLIC_DIR));
		const [left, right] = await renderer.render(project, 0);

		expect(left.length).toBeGreaterThan(1000);
		expect(right.length).toBe(left.length);

		let peak = 0;
		for (let i = 0; i < left.length; i++) {
			peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
		}
		expect(peak).toBeGreaterThan(0.01);
	});
});
