import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadBtpFromFile } from './btp-loader';
import { FileSystemResourceLoader } from './resource-loader-node';
import { ensureCoreRegistry } from '../src/lib/chips/registry-core';
import type { PsgExportModules } from '../src/lib/services/file/ay/psg-export';
import { generatePSGBuffer } from '../src/lib/services/file/ay/psg-export';
import type { Project } from '../src/lib/models/project';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

function printUsage(): void {
	console.error(`Usage: btp-to-psg <input.btp> [output-base]
Converts a Bitphase project (.btp) to a Bulba .psg register dump.

  input.btp    Path to the BTP file to convert
  output-base  Optional output base path (default: input name without extension).
               Produces <base>.psg; for multi-AY-song projects, produces
               <base>_ayN.psg per AY song.`);
}

async function loadModulesFromPublic(
	resourceLoader: FileSystemResourceLoader
): Promise<PsgExportModules> {
	const [
		ayumiState,
		trackerPatternProcessor,
		ayAudioDriver,
		ayChipRegisterState,
		virtualChannelMixer
	] = await Promise.all([
		resourceLoader.loadModule<{ default: PsgExportModules['AyumiState'] }>('ay/ayumi-state.js'),
		resourceLoader.loadModule<{ default: PsgExportModules['TrackerPatternProcessor'] }>(
			'tracker/tracker-pattern-processor.js'
		),
		resourceLoader.loadModule<{ default: PsgExportModules['AYAudioDriver'] }>('ay/ay-audio-driver.js'),
		resourceLoader.loadModule<{ default: PsgExportModules['AYChipRegisterState'] }>(
			'ay/ay-chip-register-state.js'
		),
		resourceLoader.loadModule<{ default: PsgExportModules['VirtualChannelMixer'] }>(
			'ay/virtual-channel-mixer.js'
		)
	]);
	return {
		AyumiState: ayumiState.default,
		TrackerPatternProcessor: trackerPatternProcessor.default,
		AYAudioDriver: ayAudioDriver.default,
		AYChipRegisterState: ayChipRegisterState.default,
		VirtualChannelMixer: virtualChannelMixer.default
	};
}

function getAYSongIndices(project: Project): number[] {
	const aySongIndices: number[] = [];
	for (let index = 0; index < project.songs.length; index++) {
		const song = project.songs[index];
		if (song && (!song.chipType || song.chipType === 'ay')) {
			aySongIndices.push(index);
		}
	}
	return aySongIndices;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args.length < 1) {
		printUsage();
		process.exit(1);
	}

	const inputPath = path.resolve(process.cwd(), args[0]);
	const outputBase =
		args[1] !== undefined
			? path.resolve(process.cwd(), args[1])
			: inputPath.replace(/\.btp$/i, '');

	if (!fs.existsSync(inputPath)) {
		console.error(`Error: Input file not found: ${inputPath}`);
		process.exit(1);
	}

	if (!fs.existsSync(PUBLIC_DIR)) {
		console.error(`Error: Public directory not found: ${PUBLIC_DIR}`);
		console.error('Run this command from the project root.');
		process.exit(1);
	}

	const resourceLoader = new FileSystemResourceLoader(PUBLIC_DIR);

	try {
		await ensureCoreRegistry();
		const project = loadBtpFromFile(inputPath);
		const modules = await loadModulesFromPublic(resourceLoader);
		const aySongIndices = getAYSongIndices(project);

		if (aySongIndices.length === 0) {
			console.error('Error: Project has no AY songs to export.');
			process.exit(1);
		}

		const multipleSongs = aySongIndices.length > 1;

		for (let index = 0; index < aySongIndices.length; index++) {
			const songIndex = aySongIndices[index]!;
			process.stderr.write(`\r[${index + 1}/${aySongIndices.length}] Generating PSG...    `);
			const buffer = await generatePSGBuffer(project, songIndex, { modules });
			const base = multipleSongs ? `${outputBase}_ay${index + 1}` : outputBase;
			fs.writeFileSync(`${base}.psg`, Buffer.from(buffer));
			console.error(`\nWrote: ${base}.psg`);
		}
	} catch (error) {
		console.error('\nError:', error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main();
