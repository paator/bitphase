import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { generatePSGBuffer } from '@/lib/services/file/ay/psg-export';
import { generateTaymFile } from '@/lib/services/file/taym/taym-export';
import { generateVgmBuffer } from '@/lib/services/file/vgm/vgm-export';
import { VGM_DUAL_CHIP_CLOCK_BIT, VGM_VERSION_1_71 } from '@/lib/services/file/vgm/vgm-encoder';
import { readTaym } from '@/lib/services/file/taym/codec';
import { check } from '@/lib/services/file/taym/validate';
import { FileImportService } from '@/lib/services/file/project/file-import';
import type { Project } from '@/lib/models/project';
import AyumiState from '../../public/ay/ayumi-state.js';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import TrackerPatternProcessor from '../../public/tracker/tracker-pattern-processor.js';
import VirtualChannelMixer from '../../public/ay/virtual-channel-mixer.js';
import { instrumentHasSample, advanceSamplePosition } from '../../public/ay/ay-sample-playback.js';
import SaaAudioDriver, { resolveSaaHardwareState } from '../../public/saa/saa-audio-driver.js';
import SaaVirtualChannelMixer from '../../public/saa/saa-virtual-channel-mixer.js';
import SaaRegisterState from '../../public/saa/saa-register-state.js';
import SaaState from '../../public/saa/saa-state.js';
import { saaPeriodFromCode } from '../../public/saa/saa-levels.js';
import {
	TIMER_EFFECTS_DEMOS,
	VGM_DEMOS,
	aySongIndices,
	demoStem,
	isTimerEffectsDemo,
	isVgmDemo,
	psgReferenceFilenames
} from './demo-dump-cases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '../../src/demo');

const psgProcessorModules = {
	AyumiState,
	TrackerPatternProcessor,
	AYAudioDriver,
	AYChipRegisterState,
	VirtualChannelMixer
};

const taymProcessorModules = {
	...psgProcessorModules,
	instrumentHasSample,
	advanceSamplePosition
};

const saaProcessorModules = {
	SaaState,
	TrackerPatternProcessor,
	SaaAudioDriver,
	SaaRegisterState,
	SaaVirtualChannelMixer,
	resolveSaaHardwareState,
	saaPeriodFromCode
};

const ANGEL_ISLAND_SAA_CLOCK = 7159090;

function listDemoTracks(): string[] {
	return fs
		.readdirSync(DEMO_DIR)
		.filter((file) => file.endsWith('.btp'))
		.sort();
}

async function loadDemoProject(btpFilename: string): Promise<Project> {
	const gzipped = fs.readFileSync(path.join(DEMO_DIR, btpFilename));
	const text = gunzipSync(gzipped).toString('utf-8');
	return FileImportService.reconstructFromJsonAsync(text);
}

function readReference(filePath: string, kind: string): Buffer {
	expect(fs.existsSync(filePath), `Missing ${kind} reference dump: ${filePath}`).toBe(true);
	return fs.readFileSync(filePath);
}

async function assertPSGMatchesReference(
	project: Project,
	songIndex: number,
	psgFilename: string
): Promise<void> {
	const generated = await generatePSGBuffer(project, songIndex, {
		modules: psgProcessorModules
	});
	const expected = readReference(path.resolve(__dirname, psgFilename), 'PSG');
	expect(
		Buffer.from(generated).equals(expected),
		`Generated PSG (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

function assertAngelIslandVgm(generated: ArrayBuffer): void {
	const view = new DataView(generated);
	const clock = view.getUint32(0xc8, true) >>> 0;
	expect(view.getUint32(0x08, true)).toBe(VGM_VERSION_1_71);
	expect(view.getUint32(0x74, true)).toBe(0);
	expect(view.getUint32(0x84, true)).toBe(0);
	expect(clock & ~VGM_DUAL_CHIP_CLOCK_BIT).toBe(ANGEL_ISLAND_SAA_CLOCK);
	expect(clock & VGM_DUAL_CHIP_CLOCK_BIT).toBe(VGM_DUAL_CHIP_CLOCK_BIT);
	expect(view.getUint32(0x1c, true)).toBeGreaterThan(0);
	expect(view.getUint32(0x20, true)).toBeGreaterThan(0);
}

async function assertVgmMatchesReference(
	project: Project,
	btpFilename: string,
	vgmFilename: string
): Promise<void> {
	const generated = await generateVgmBuffer(project, { saaModules: saaProcessorModules });
	if (btpFilename === 'angel_island.btp') {
		assertAngelIslandVgm(generated);
	}
	const expected = readReference(path.resolve(__dirname, '../vgm', vgmFilename), 'VGM');
	expect(
		Buffer.from(generated).equals(expected),
		`Generated VGM (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

async function assertTAYMMatchesReference(project: Project, taymFilename: string): Promise<void> {
	const generated = await generateTaymFile(project, 0, {
		modules: taymProcessorModules
	});
	const expected = readReference(path.resolve(__dirname, '../taym', taymFilename), 'TAYM');
	expect(
		Buffer.from(generated).equals(expected),
		`Generated TAYM (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

const demoTracks = listDemoTracks();

describe('demo track reference dumps', () => {
	it('covers every demo track', () => {
		expect(demoTracks.length).toBeGreaterThan(0);
		for (const demo of [...TIMER_EFFECTS_DEMOS, ...VGM_DEMOS]) {
			expect(demoTracks).toContain(demo);
		}
	});

	for (const btpFilename of demoTracks) {
		const stem = demoStem(btpFilename);

		if (isTimerEffectsDemo(btpFilename)) {
			it(`${stem}: dynamically generated TAYM matches reference dump`, async () => {
				const project = await loadDemoProject(btpFilename);
				await assertTAYMMatchesReference(project, `${stem}.taym`);
			});
			continue;
		}

		if (isVgmDemo(btpFilename)) {
			it(`${stem}: dynamically generated VGM matches reference dump`, async () => {
				const project = await loadDemoProject(btpFilename);
				await assertVgmMatchesReference(project, btpFilename, `${stem}.vgm`);
			});
			continue;
		}

		it(`${stem}: dynamically generated PSG matches reference dump`, async () => {
			const project = await loadDemoProject(btpFilename);
			const songs = aySongIndices(project);
			expect(songs.length, `${stem} should have at least one AY song`).toBeGreaterThan(0);
			const names = psgReferenceFilenames(stem, songs.length);
			for (let i = 0; i < songs.length; i++) {
				await assertPSGMatchesReference(project, songs[i]!, names[i]!);
			}
		});
	}
});

describe('demo TAYM exports', () => {
	async function exportDemo(btpFilename: string) {
		const project = await loadDemoProject(btpFilename);
		return readTaym(await generateTaymFile(project, 0, { modules: taymProcessorModules }));
	}

	it('a_bit_steps loops where pattern 05 starts and says how it was written', async () => {
		const taym = await exportDemo('a_bit_steps.btp');
		expect(() => check(taym)).not.toThrow();
		expect(taym.trak.loopFrame).toBe(212);
		expect(taym.info).toMatchObject({
			tracker: 'Bitphase',
			tuning: 'Custom (2.00 MHz)',
			a4: '441',
			speed: '3',
			tempo: '150',
			pattern_length: '128',
			row_frames: '3,2'
		});
	});

	it('atarized loops at its last pattern and states no A4 for a table', async () => {
		const taym = await exportDemo('atarized.btp');
		expect(() => check(taym)).not.toThrow();
		expect(taym.trak.loopFrame).toBe(9471);
		expect(taym.info.row_frames).toBe('3');
		expect(taym.info.a4).toBeUndefined();
		expect(taym.info.tempo).toBeUndefined();
	});
});
