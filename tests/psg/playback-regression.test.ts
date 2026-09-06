import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { generatePSGBuffer } from '@/lib/services/file/ay/psg-export';
import { generateTaymFile } from '@/lib/services/file/taym/taym-export';
import { FileImportService } from '@/lib/services/file/project/file-import';
import AyumiState from '../../public/ay/ayumi-state.js';
import AYAudioDriver from '../../public/ay/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import TrackerPatternProcessor from '../../public/tracker/tracker-pattern-processor.js';
import VirtualChannelMixer from '../../public/ay/virtual-channel-mixer.js';
import {
	instrumentHasSample,
	advanceSamplePosition
} from '../../public/ay/ay-sample-playback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function loadDemoProject(btpFilename: string) {
	const btpPath = path.resolve(__dirname, '../../src/demo', btpFilename);
	const gzipped = fs.readFileSync(btpPath);
	const text = gunzipSync(gzipped).toString('utf-8');
	return FileImportService.reconstructFromJsonAsync(text);
}

async function assertPSGMatchesReference(btpFilename: string, psgFilename: string): Promise<void> {
	const project = await loadDemoProject(btpFilename);
	const generated = await generatePSGBuffer(project, 0, {
		modules: psgProcessorModules
	});

	const expectedPath = path.resolve(__dirname, psgFilename);
	const expected = fs.readFileSync(expectedPath);
	expect(
		Buffer.from(generated).equals(expected),
		`Generated PSG (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

async function assertTAYMMatchesReference(btpFilename: string, taymFilename: string): Promise<void> {
	const project = await loadDemoProject(btpFilename);
	const generated = await generateTaymFile(project, 0, {
		modules: taymProcessorModules
	});

	const expectedPath = path.resolve(__dirname, '../taym', taymFilename);
	const expected = fs.readFileSync(expectedPath);
	expect(
		Buffer.from(generated).equals(expected),
		`Generated TAYM (${generated.byteLength} bytes) must match reference (${expected.length} bytes) byte-for-byte`
	).toBe(true);
}

describe('PSG playback regression', { timeout: 30_000 }, () => {
	it('kizuna: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('kizuna.btp', 'kizuna.psg');
	}, 30_000);

	it('frozen_over: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('frozen_over.btp', 'frozen_over.psg');
	}, 30_000);

	it('man: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('man.btp', 'man.psg');
	}, 30_000);
});

describe('TAYM playback regression', () => {
	it('atarized: dynamically generated TAYM matches reference dump', async () => {
		await assertTAYMMatchesReference('atarized.btp', 'atarized.taym');
	}, 120_000);
});
