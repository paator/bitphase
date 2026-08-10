export type ProjectActionType =
	| 'pattern.edit'
	| 'pattern.bulkEdit'
	| 'pattern.resize'
	| 'pattern.insertRow'
	| 'pattern.removeRow'
	| 'patternOrder.add'
	| 'patternOrder.remove'
	| 'patternOrder.move'
	| 'patternOrder.setPatternId'
	| 'patternOrder.clone'
	| 'patternOrder.makeUnique'
	| 'patternOrder.loopPoint'
	| 'patternOrder.color'
	| 'table.add'
	| 'table.remove'
	| 'table.copy'
	| 'table.update'
	| 'table.changeId'
	| 'table.replace'
	| 'instrument.add'
	| 'instrument.remove'
	| 'instrument.copy'
	| 'instrument.update'
	| 'instrument.changeId'
	| 'instrument.replace'
	| 'settings.update'
	| 'chipSettings.update'
	| 'virtualChannels.update'
	| 'composite';

export type ProjectHistoryDomain =
	| 'patterns'
	| 'patternOrder'
	| 'tables'
	| 'instruments'
	| 'songs'
	| 'settings'
	| 'chipSettings'
	| 'virtualChannels';

export type ProjectHistoryPathSegment = string | number;
export type ProjectHistoryPath = ProjectHistoryPathSegment[];

export interface ProjectSetDiff {
	kind: 'set';
	path: ProjectHistoryPath;
	before: unknown;
	after: unknown;
}

export interface ProjectInsertDiff {
	kind: 'insert';
	path: ProjectHistoryPath;
	index: number;
	values: unknown[];
}

export interface ProjectRemoveDiff {
	kind: 'remove';
	path: ProjectHistoryPath;
	index: number;
	values: unknown[];
}

export interface ProjectMoveDiff {
	kind: 'move';
	path: ProjectHistoryPath;
	fromIndex: number;
	toIndex: number;
}

export type ProjectDiff = ProjectSetDiff | ProjectInsertDiff | ProjectRemoveDiff | ProjectMoveDiff;

export interface ProjectHistorySelection {
	songIndex?: number;
	patternOrderIndex?: number;
	row?: number;
	column?: number;
	tableId?: number;
	instrumentId?: string;
}

export interface ProjectHistoryEntry {
	type: ProjectActionType;
	label: string;
	undoLabel: string;
	redoLabel: string;
	diffs: ProjectDiff[];
	inverseDiffs: ProjectDiff[];
	affectedDomains: ProjectHistoryDomain[];
	beforeSelection?: ProjectHistorySelection;
	afterSelection?: ProjectHistorySelection;
}

export interface ProjectHistoryMetadata {
	type: ProjectActionType;
	label: string;
	undoLabel?: string;
	redoLabel?: string;
	affectedDomains: ProjectHistoryDomain[];
	beforeSelection?: ProjectHistorySelection;
	afterSelection?: ProjectHistorySelection;
}
