import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { generatePSGBuffer } from '@/lib/services/file/psg-export';
import { FileImportService } from '@/lib/services/file/file-import';
import AyumiState from '../../public/ayumi-state.js';
import AYAudioDriver from '../../public/ay-audio-driver.js';
import AYChipRegisterState from '../../public/ay-chip-register-state.js';
import TrackerPatternProcessor from '../../public/tracker-pattern-processor.js';
import VirtualChannelMixer from '../../public/virtual-channel-mixer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const psgProcessorModules = {
	AyumiState,
	TrackerPatternProcessor,
	AYAudioDriver,
	AYChipRegisterState,
	VirtualChannelMixer
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

describe('PSG playback regression', () => {
	it('kizuna: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('kizuna.btp', 'kizuna.psg');
	});

	it('frozen_over: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('frozen_over.btp', 'frozen_over.psg');
	});

	it('man: dynamically generated PSG matches reference dump', async () => {
		await assertPSGMatchesReference('man.btp', 'man.psg');
	});
});
