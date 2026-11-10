import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/lib/models/project';
import { autobackupService } from '@/lib/services/backup/autobackup-service';
import { FileExportService } from '@/lib/services/file/project/file-export';

const project = {} as Project;

describe('autobackup service scheduling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(FileExportService, 'serializeProject').mockReturnValue('');
		vi.spyOn(FileExportService, 'compressData').mockReturnValue(new Promise(() => {}));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('reads the project once after edits settle', () => {
		const readProject = vi.fn(() => project);
		autobackupService.scheduleAutobackup(readProject);
		autobackupService.scheduleAutobackup(readProject);
		vi.advanceTimersByTime(999);
		autobackupService.scheduleAutobackup(readProject);
		vi.advanceTimersByTime(999);
		expect(readProject).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(readProject).toHaveBeenCalledTimes(1);
	});

	it('drops the scheduled save when saving immediately', () => {
		const readProject = vi.fn(() => project);
		autobackupService.scheduleAutobackup(readProject);
		autobackupService.saveAutobackup(project);
		vi.advanceTimersByTime(5000);
		expect(readProject).not.toHaveBeenCalled();
	});
});
