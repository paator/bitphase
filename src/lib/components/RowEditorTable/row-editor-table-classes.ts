export const ROW_EDITOR_MAX_ROWS = 512;

export function expandedRowNumberSizeClass(isExpanded: boolean): string {
	return isExpanded ? 'w-14 min-w-14 px-2 py-1.5' : 'w-8 min-w-8 px-1 py-1 text-[0.65rem]';
}

export function expandedActionsCellClass(isExpanded: boolean): string {
	return isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 min-w-10 px-0.5';
}

export function expandedLoopCellClass(isExpanded: boolean): string {
	return isExpanded
		? 'w-6 min-w-6 cursor-pointer px-1.5 text-center text-sm'
		: 'w-4 min-w-4 cursor-pointer px-0.5 text-center text-[0.65rem]';
}

export function expandedRowHeightClass(isExpanded: boolean): string {
	return isExpanded ? 'h-8' : 'h-7';
}

export function expandedIconSizeClass(isExpanded: boolean): string {
	return isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3';
}

export function expandedHeaderRowClass(isExpanded: boolean): string {
	return isExpanded ? 'w-14 min-w-14 px-2 py-1.5' : 'w-8 min-w-8 px-1 py-1';
}

export function expandedHeaderActionsClass(isExpanded: boolean): string {
	return isExpanded ? 'w-12 min-w-12 px-1' : 'w-10 min-w-10 px-0.5';
}

export function expandedHeaderLoopClass(isExpanded: boolean): string {
	return isExpanded ? 'w-6 min-w-6 px-1.5' : 'w-4 min-w-4 px-0.5';
}
