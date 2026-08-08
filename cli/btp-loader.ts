import fs from 'fs';
import { gunzipSync } from 'zlib';
import { getChipByType } from '../src/lib/chips/registry-core';
import { FileImportService } from '../src/lib/services/file/project/file-import';
import type { Project } from '../src/lib/models/project';

export function loadBtpFromFile(filePath: string): Project {
	const buffer = fs.readFileSync(filePath);
	const text = gunzipSync(buffer).toString('utf-8');
	return FileImportService.reconstructFromJson(text, getChipByType);
}
