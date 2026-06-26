import { clampLoopRow, resizeRowList, removeRowAt, removeRowsFromBottomAt } from './row-list-operations';

type NamedRowSource = {
	id: string | number;
	name: string;
	rows: unknown[];
	loop: number;
};

export class NamedRowEditorSync<TRow> {
	rows = $state<TRow[]>([]);
	loopRow = $state(0);
	name = $state('');

	private lastSourceId: string | number;
	private lastSyncedName = '';
	private lastSyncedRows: unknown[] = [];
	private lastSyncedLoop = 0;

	constructor(
		private readonly options: {
			getSource: () => NamedRowSource;
			normalizeRows: (rows: unknown[]) => TRow[];
			onUpdate: (updates: { name?: string; rows?: TRow[]; loop?: number }) => void;
			onSourceIdChange?: () => void;
		}
	) {
		const source = options.getSource();
		this.rows = options.normalizeRows([...source.rows]);
		this.loopRow = source.loop;
		this.name = source.name;
		this.lastSourceId = source.id;
		this.lastSyncedName = source.name;
		this.lastSyncedRows = [...source.rows];
		this.lastSyncedLoop = source.loop;

		$effect(() => {
			const currentSource = this.options.getSource();
			if (currentSource.id !== this.lastSourceId) {
				this.lastSourceId = currentSource.id;
				this.syncFromSource();
				this.options.onSourceIdChange?.();
			} else {
				const rowsChanged =
					currentSource.rows.length !== this.lastSyncedRows.length ||
					currentSource.rows.some((row, i) => row !== this.lastSyncedRows[i]);
				const loopChanged = currentSource.loop !== this.lastSyncedLoop;
				const nameChanged = currentSource.name !== this.lastSyncedName;

				if (rowsChanged || loopChanged) {
					this.rows = this.options.normalizeRows([...currentSource.rows]);
					this.loopRow = currentSource.loop;
					this.lastSyncedRows = [...currentSource.rows];
					this.lastSyncedLoop = currentSource.loop;
				}
				if (nameChanged) {
					this.name = currentSource.name;
					this.lastSyncedName = currentSource.name;
				}
			}
		});

		$effect(() => {
			if (this.name !== this.lastSyncedName) {
				this.options.onUpdate({ name: this.name });
			}
		});
	}

	syncFromSource(): void {
		const source = this.options.getSource();
		this.rows = this.options.normalizeRows([...source.rows]);
		this.loopRow = source.loop;
		this.name = source.name;
		this.lastSyncedRows = [...source.rows];
		this.lastSyncedLoop = source.loop;
		this.lastSyncedName = source.name;
	}

	pushRows(nextRows: TRow[]): void {
		this.rows = nextRows;
		this.options.onUpdate({ rows: nextRows });
	}

	setLoop(index: number): void {
		this.loopRow = index;
		this.options.onUpdate({ loop: this.loopRow });
	}

	applyRowChange(nextRows: TRow[]): void {
		this.loopRow = clampLoopRow(this.loopRow, nextRows.length);
		this.pushRows(nextRows);
		this.options.onUpdate({ loop: this.loopRow });
	}

	addRow(createRow: () => TRow): void {
		this.applyRowChange([...this.rows, createRow()]);
	}

	setRowCount(targetCount: number, createRow: () => TRow, maxRows: number): void {
		const nextRows = resizeRowList(this.rows, targetCount, createRow, maxRows);
		if (nextRows !== this.rows) {
			this.applyRowChange(nextRows);
		}
	}

	removeRow(index: number): void {
		const nextRows = removeRowAt(this.rows, index);
		if (nextRows) this.applyRowChange(nextRows);
	}

	removeRowsFromBottom(index: number): void {
		const nextRows = removeRowsFromBottomAt(this.rows, index);
		if (nextRows) this.applyRowChange(nextRows);
	}
}
