import type { Pattern } from '../../models/song';
import { PatternFieldDetection } from './editing/pattern-field-detection';
import { PatternValueUpdates } from './editing/pattern-value-updates';
import { PatternDeleteHandler } from './editing/pattern-delete-handler';
import type { EditingContext, FieldInfo } from './editing/editing-context';
import {
	clipboardStore,
	type ClipboardCell,
	type ClipboardData
} from '../../stores/clipboard.svelte';
import {
	envelopePeriodToNoteString,
	noteStringToEnvelopePeriod
} from '../../utils/envelope-note-conversion';
import type { PatternConverter } from '../../chips/base/adapter';
import type { PatternFormatter } from '../../chips/base/formatter-interface';
import type { ChipSchema } from '../../chips/base/schema';
import type { GenericPattern } from '../../models/song/generic';
import { PatternTemplateParser } from './editing/pattern-template-parsing';
import { EffectField } from './editing/effect-field';
import {
	getPatternEffectColumnCounts,
	resolveSchemaField
} from '../../chips/base/channel-effect-columns';
import {
	clipboardAllowsNoteEnvelopeConversion,
	clipboardFieldsAreCompatible,
	clipboardNoteEnvelopeConversionTarget,
	minClipboardChannelIndex,
	resolveClipboardDestChannelIndex,
	resolveClipboardDestFieldKey,
	resolveClipboardDestGlobalFieldKey
} from './clipboard-field-mapping';

export interface ClipboardContext {
	pattern: Pattern;
	selectedRow: number;
	selectedColumn: number;
	hasSelection: boolean;
	getSelectionBounds: () => {
		minRow: number;
		maxRow: number;
		minCol: number;
		maxCol: number;
	} | null;
	getCellPositions: (rowString: string, row: number) => any[];
	getPatternRowData: (pattern: Pattern, row: number) => string;
	createEditingContext: (pattern: Pattern, row: number, col: number) => EditingContext;
	tuningTable?: number[];
	getOctave?: () => number;
	converter: PatternConverter;
	formatter: PatternFormatter;
	schema: ChipSchema;
}

export class ClipboardService {
	static copySelection(context: ClipboardContext): void {
		const { pattern, selectedRow, selectedColumn, hasSelection } = context;

		if (hasSelection) {
			this.copyMultipleCells(context);
		} else {
			this.copySingleCell(context, pattern, selectedRow, selectedColumn);
		}
	}

	private static copyMultipleCells(context: ClipboardContext): void {
		const { pattern, getSelectionBounds, getCellPositions, converter, formatter, schema } =
			context;
		const bounds = getSelectionBounds();
		if (!bounds) return;

		const { minRow, maxRow, minCol, maxCol } = bounds;
		const genericPattern = converter.toGeneric(pattern);
		const cells: ClipboardCell[] = [];

		for (let row = minRow; row <= maxRow && row < pattern.length; row++) {
			const rowString = this.formatGenericRow(genericPattern, row, formatter, schema);
			const cellPositions = getCellPositions(rowString, row);

			for (let col = minCol; col <= maxCol && col < cellPositions.length; col++) {
				const cell = cellPositions[col];
				if (!cell.fieldKey) continue;

				const fieldInfo = this.detectFieldDirect(cell, rowString, schema, pattern);
				if (!fieldInfo) continue;

				const field = this.getFieldDef(schema, cell.fieldKey);
				if (!field) continue;

				const value = PatternValueUpdates.getValueFromGeneric(
					genericPattern,
					row,
					fieldInfo
				);

				cells.push({
					row: row - minRow,
					column: col - minCol,
					fieldKey: cell.fieldKey,
					fieldType: field.type,
					value,
					channelIndex: fieldInfo.channelIndex
				});
			}
		}

		this.copyToStoreAndSystem(cells, 0, 0, maxRow - minRow, maxCol - minCol);
	}

	private static copySingleCell(
		context: ClipboardContext,
		pattern: Pattern,
		row: number,
		col: number
	): void {
		const { getCellPositions, converter, formatter, schema } = context;
		const genericPattern = converter.toGeneric(pattern);
		const rowString = this.formatGenericRow(genericPattern, row, formatter, schema);
		const cellPositions = getCellPositions(rowString, row);

		const cell = cellPositions[col];
		if (!cell.fieldKey) return;

		const fieldInfo = this.detectFieldDirect(cell, rowString, schema, pattern);
		if (!fieldInfo) return;

		const field = this.getFieldDef(schema, cell.fieldKey);
		if (!field) return;

		const value = PatternValueUpdates.getValueFromGeneric(genericPattern, row, fieldInfo);

		this.copyToStoreAndSystem(
			[
				{
					row: 0,
					column: 0,
					fieldKey: cell.fieldKey,
					fieldType: field.type,
					value,
					channelIndex: fieldInfo.channelIndex
				}
			],
			0,
			0,
			0,
			0
		);
	}

	static cutSelection(
		context: ClipboardContext,
		onPatternUpdate: (pattern: Pattern) => void
	): void {
		const { pattern, hasSelection, getSelectionBounds, selectedRow, selectedColumn } = context;
		const { getCellPositions, converter, formatter, schema } = context;

		const bounds = hasSelection
			? getSelectionBounds()
			: {
					minRow: selectedRow,
					maxRow: selectedRow,
					minCol: selectedColumn,
					maxCol: selectedColumn
				};
		if (!bounds) return;

		const { minRow, maxRow, minCol, maxCol } = bounds;
		const genericPattern = converter.toGeneric(pattern);
		const clipboardCells: ClipboardCell[] = [];

		interface DeletionOp {
			row: number;
			fieldInfo: FieldInfo;
			field: { type: string; length: number; allowZeroValue?: boolean };
		}
		const deletionOps: DeletionOp[] = [];

		for (let row = minRow; row <= maxRow && row < pattern.length; row++) {
			const rowString = this.formatGenericRow(genericPattern, row, formatter, schema);
			const cellPositions = getCellPositions(rowString, row);

			for (let col = minCol; col <= maxCol && col < cellPositions.length; col++) {
				const cell = cellPositions[col];
				if (!cell.fieldKey) continue;

				const fieldInfo = this.detectFieldDirect(cell, rowString, schema, pattern);
				if (!fieldInfo) continue;

				const field = this.getFieldDef(schema, cell.fieldKey);
				if (!field) continue;

				const value = PatternValueUpdates.getValueFromGeneric(
					genericPattern,
					row,
					fieldInfo
				);
				clipboardCells.push({
					row: row - minRow,
					column: col - minCol,
					fieldKey: cell.fieldKey,
					fieldType: field.type,
					value,
					channelIndex: fieldInfo.channelIndex
				});

				deletionOps.push({ row, fieldInfo, field });
			}
		}

		this.copyToStoreAndSystem(clipboardCells, 0, 0, maxRow - minRow, maxCol - minCol);

		if (deletionOps.length > 0) {
			for (const { row, fieldInfo, field } of deletionOps) {
				this.applyDeleteToGeneric(
					genericPattern,
					row,
					fieldInfo,
					field,
					schema,
					context.tuningTable
				);
			}
			onPatternUpdate(converter.fromGeneric(genericPattern));
		}
	}

	static bulkDelete(
		context: ClipboardContext,
		bounds: { minRow: number; maxRow: number; minCol: number; maxCol: number }
	): Pattern | null {
		const { pattern, getCellPositions, converter, formatter, schema } = context;
		const genericPattern = converter.toGeneric(pattern);
		let hasChanges = false;

		for (let row = bounds.minRow; row <= bounds.maxRow && row < pattern.length; row++) {
			const rowString = this.formatGenericRow(genericPattern, row, formatter, schema);
			const cellPositions = getCellPositions(rowString, row);

			for (
				let col = bounds.minCol;
				col <= bounds.maxCol && col < cellPositions.length;
				col++
			) {
				const cell = cellPositions[col];
				if (!cell.fieldKey) continue;

				const fieldInfo = this.detectFieldDirect(cell, rowString, schema, pattern);
				if (!fieldInfo) continue;

				const field = this.getFieldDef(schema, cell.fieldKey);
				if (!field) continue;

				this.applyDeleteToGeneric(
					genericPattern,
					row,
					fieldInfo,
					field,
					schema,
					context.tuningTable
				);
				hasChanges = true;
			}
		}

		return hasChanges ? converter.fromGeneric(genericPattern) : null;
	}

	private static formatGenericRow(
		generic: GenericPattern,
		row: number,
		formatter: PatternFormatter,
		schema: ChipSchema
	): string {
		const patternRow = generic.patternRows[row];
		const channels = generic.channels.map((ch) => ch.rows[row]);
		return formatter.formatRow(patternRow, channels, row, schema);
	}

	private static detectFieldDirect(
		cell: { fieldKey?: string; charIndex: number },
		rowString: string,
		schema: ChipSchema,
		pattern: Pattern
	): FieldInfo | null {
		if (!cell.fieldKey) return null;

		const field = resolveSchemaField(schema, cell.fieldKey);
		if (!field) return null;

		const effectColumnCounts = getPatternEffectColumnCounts(pattern);
		const isGlobal = !!schema.globalFields?.[cell.fieldKey];
		const channelIndex = isGlobal
			? -1
			: PatternTemplateParser.calculateChannelIndexForField(
					cell.fieldKey,
					cell.charIndex,
					rowString,
					schema,
					effectColumnCounts
				);

		const fieldStart = PatternTemplateParser.findFieldStartPositionInRowString(
			rowString,
			cell.fieldKey,
			cell.charIndex,
			schema,
			effectColumnCounts
		);
		const charOffset = cell.charIndex - fieldStart;

		return {
			fieldKey: cell.fieldKey,
			fieldType: field.type,
			isGlobal,
			channelIndex,
			charOffset
		};
	}

	private static getFieldDef(
		schema: ChipSchema,
		fieldKey: string
	): { type: string; length: number; allowZeroValue?: boolean } | null {
		const field = resolveSchemaField(schema, fieldKey);
		return field
			? { type: field.type, length: field.length, allowZeroValue: field.allowZeroValue }
			: null;
	}

	private static applyDeleteToGeneric(
		generic: GenericPattern,
		row: number,
		fieldInfo: FieldInfo,
		field: { type: string; length: number; allowZeroValue?: boolean },
		schema: ChipSchema,
		tuningTable?: number[]
	): void {
		PatternDeleteHandler.deleteFieldInGeneric(
			generic,
			row,
			fieldInfo,
			field,
			schema,
			tuningTable
		);
	}

	static async pasteSelection(
		context: ClipboardContext,
		onPatternUpdate: (pattern: Pattern) => void
	): Promise<void> {
		await this.applyClipboardCells(context, onPatternUpdate, false);
	}

	private static getPasteValue(
		clipCell: ClipboardCell,
		targetFieldKey: string,
		schema: ChipSchema,
		tuningTable: number[] | undefined,
		getOctave: (() => number) | undefined,
		allowNoteEnvelopeConversion: boolean
	): string | number | null | Record<string, unknown> {
		if (clipboardFieldsAreCompatible(clipCell.fieldKey, targetFieldKey, schema)) {
			return clipCell.value as string | number | null | Record<string, unknown>;
		}
		if (!allowNoteEnvelopeConversion) return null;
		if (
			clipCell.fieldKey === 'envelopeValue' &&
			targetFieldKey === 'note' &&
			tuningTable?.length
		) {
			const period = typeof clipCell.value === 'number' ? clipCell.value : 0;
			const noteStr = envelopePeriodToNoteString(period, tuningTable);
			return noteStr ?? '---';
		}
		if (
			clipCell.fieldKey === 'note' &&
			targetFieldKey === 'envelopeValue' &&
			tuningTable?.length &&
			getOctave
		) {
			const noteStr = typeof clipCell.value === 'string' ? clipCell.value : '---';
			return noteStringToEnvelopePeriod(noteStr, tuningTable, getOctave());
		}
		return null;
	}

	private static findFieldColumnInScope(
		fieldKey: string,
		destChannelIndex: number,
		pattern: Pattern,
		rowString: string,
		cellPositions: Array<{ fieldKey?: string; charIndex: number }>,
		schema: ClipboardContext['schema']
	): number | null {
		for (let col = 0; col < cellPositions.length; col++) {
			const cell = cellPositions[col];
			if (cell.fieldKey !== fieldKey) continue;
			const fieldInfo = this.detectFieldDirect(cell, rowString, schema, pattern);
			if (!fieldInfo) continue;
			if (destChannelIndex < 0) {
				if (fieldInfo.isGlobal) return col;
				continue;
			}
			if (!fieldInfo.isGlobal && fieldInfo.channelIndex === destChannelIndex) {
				return col;
			}
		}
		return null;
	}

	private static resolvePasteColumn(
		clipCell: ClipboardCell,
		context: ClipboardContext,
		pattern: Pattern,
		rowString: string,
		cellPositions: Array<{ fieldKey?: string; charIndex: number }>,
		originChannelIndex: number,
		originFieldKey: string | undefined,
		minSourceChannelIndex: number,
		sourceFieldKeys: string[],
		allowNoteEnvelopeConversion: boolean
	): number | null {
		const destChannelIndex = resolveClipboardDestChannelIndex(
			clipCell.channelIndex,
			originChannelIndex,
			minSourceChannelIndex
		);
		const destFieldKey = resolveClipboardDestGlobalFieldKey(
			resolveClipboardDestFieldKey(clipCell.fieldKey, originFieldKey, sourceFieldKeys),
			context.schema,
			originFieldKey,
			originChannelIndex,
			minSourceChannelIndex,
			sourceFieldKeys
		);
		const matchedCol = this.findFieldColumnInScope(
			destFieldKey,
			destChannelIndex,
			pattern,
			rowString,
			cellPositions,
			context.schema
		);
		if (matchedCol !== null) return matchedCol;
		if (!allowNoteEnvelopeConversion) return null;
		const conversionTarget = clipboardNoteEnvelopeConversionTarget(clipCell.fieldKey);
		if (!conversionTarget) return null;
		const conversionChannel =
			conversionTarget === 'note' ? (originChannelIndex >= 0 ? originChannelIndex : 0) : -1;
		return this.findFieldColumnInScope(
			conversionTarget,
			conversionChannel,
			pattern,
			rowString,
			cellPositions,
			context.schema
		);
	}

	private static isEmptyValue(value: unknown, fieldType: string, fieldKey: string): boolean {
		if (value === null || value === undefined) return true;

		if (fieldType === 'note') {
			if (typeof value === 'string' && value === '---') return true;
			return false;
		}

		if (EffectField.isEffectField(fieldKey)) {
			if (typeof value === 'object' && value !== null) {
				const effect = value as { effect?: number; delay?: number; parameter?: number };
				return (
					(effect.effect === 0 || effect.effect === undefined) &&
					(effect.delay === 0 || effect.delay === undefined) &&
					(effect.parameter === 0 || effect.parameter === undefined)
				);
			}
			return false;
		}

		if (fieldType === 'hex' || fieldType === 'dec' || fieldType === 'symbol') {
			return value === 0;
		}

		if (fieldType === 'text') {
			return value === '';
		}

		return false;
	}

	static async pasteSelectionWithoutErasing(
		context: ClipboardContext,
		onPatternUpdate: (pattern: Pattern) => void
	): Promise<void> {
		await this.applyClipboardCells(context, onPatternUpdate, true);
	}

	private static async applyClipboardCells(
		context: ClipboardContext,
		onPatternUpdate: (pattern: Pattern) => void,
		skipEmptyValues: boolean
	): Promise<void> {
		const clipboardData = await this.getClipboardData();
		if (!clipboardData) return;

		const {
			pattern: originalPattern,
			selectedRow,
			selectedColumn,
			getCellPositions,
			getPatternRowData,
			createEditingContext
		} = context;
		let pattern = originalPattern;
		const allowNoteEnvelopeConversion = clipboardAllowsNoteEnvelopeConversion(
			clipboardData.cells.map((cell) => cell.fieldKey)
		);
		const sourceFieldKeys = clipboardData.cells.map((cell) => cell.fieldKey);
		const minSourceChannelIndex = minClipboardChannelIndex(
			clipboardData.cells.map((cell) => cell.channelIndex)
		);

		for (const clipCell of clipboardData.cells) {
			if (
				skipEmptyValues &&
				this.isEmptyValue(clipCell.value, clipCell.fieldType, clipCell.fieldKey)
			) {
				continue;
			}

			const targetRow = selectedRow + clipCell.row;
			if (targetRow < 0 || targetRow >= pattern.length) continue;

			const rowString = getPatternRowData(pattern, targetRow);
			const cellPositions = getCellPositions(rowString, targetRow);
			const originCell = cellPositions[selectedColumn];
			const originInfo = originCell
				? this.detectFieldDirect(originCell, rowString, context.schema, pattern)
				: null;
			const originChannelIndex = originInfo?.channelIndex ?? 0;
			const resolvedCol = this.resolvePasteColumn(
				clipCell,
				context,
				pattern,
				rowString,
				cellPositions,
				originChannelIndex,
				originInfo?.fieldKey,
				minSourceChannelIndex,
				sourceFieldKeys,
				allowNoteEnvelopeConversion
			);
			if (resolvedCol === null) continue;

			const cell = cellPositions[resolvedCol];
			if (!cell?.fieldKey) continue;

			const pasteValue = this.getPasteValue(
				clipCell,
				cell.fieldKey,
				context.schema,
				context.tuningTable,
				context.getOctave,
				allowNoteEnvelopeConversion
			);
			if (
				pasteValue === null &&
				!clipboardFieldsAreCompatible(clipCell.fieldKey, cell.fieldKey, context.schema)
			) {
				continue;
			}

			const editingContext = createEditingContext(pattern, targetRow, resolvedCol);
			const fieldInfo = PatternFieldDetection.detectFieldAtCursor(editingContext);
			if (!fieldInfo) continue;

			pattern = PatternValueUpdates.updateFieldValue(
				{ ...editingContext, pattern },
				fieldInfo,
				pasteValue
			);
		}

		if (pattern !== originalPattern) {
			onPatternUpdate(pattern);
		}
	}

	private static copyToStoreAndSystem(
		cells: ClipboardCell[],
		minRow: number,
		minColumn: number,
		maxRow: number,
		maxColumn: number
	): void {
		const data = clipboardStore.copy(cells, minRow, minColumn, maxRow, maxColumn);
		void this.writeSystemClipboard(data);
	}

	private static async writeSystemClipboard(data: ClipboardData): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(clipboardStore.serialize(data));
		} catch {
			return;
		}
	}

	private static async getClipboardData(): Promise<ClipboardData | null> {
		const systemData = await this.readSystemClipboard();
		if (systemData) {
			clipboardStore.set(systemData);
			return systemData;
		}
		return clipboardStore.clipboardData;
	}

	private static async readSystemClipboard(): Promise<ClipboardData | null> {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
		try {
			const text = await navigator.clipboard.readText();
			return text ? clipboardStore.parse(text) : null;
		} catch {
			return null;
		}
	}
}
