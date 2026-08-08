import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadBtpFromFile } from './btp-loader';
import { FileSystemResourceLoader } from './resource-loader-node';
import { ensureCoreRegistry, getChipByType } from '../src/lib/chips/registry-core';
import { exportToWAV } from '../src/lib/services/file/wav/wav-export';
import { defaultWavExportSettings } from '../src/lib/services/file/wav/wav-export-settings';
import { sanitizeFilename } from '../src/lib/utils/file-download';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

function printUsage(): void {
	console.error(`Usage: btp-to-wav <input.btp> [output.wav]
Converts a Bitphase project (.btp) to WAV format.

  input.btp   Path to the BTP file to convert
  output.wav  Optional output path (default: input name with .wav extension)`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args.length < 1) {
		printUsage();
		process.exit(1);
	}

	const inputPath = path.resolve(process.cwd(), args[0]);
	const outputPath =
		args[1] !== undefined
			? path.resolve(process.cwd(), args[1])
			: inputPath.replace(/\.btp$/i, '.wav');

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
		const settings = {
			...defaultWavExportSettings,
			title: project.name || sanitizeFilename(path.basename(inputPath, '.btp'))
		};

		await exportToWAV(project, settings, (progress, message) => {
			process.stderr.write(`\r[${Math.round(progress)}%] ${message}    `);
		}, undefined, {
			resourceLoader,
			getChip: getChipByType,
			onOutput: (buffer, filename) => {
				const outPath = filename.endsWith('.zip')
					? path.join(path.dirname(outputPath), filename)
					: outputPath;
				fs.writeFileSync(outPath, Buffer.from(buffer));
				console.error(`\nWrote: ${outPath}`);
			}
		});
	} catch (error) {
		console.error('\nError:', error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main();
