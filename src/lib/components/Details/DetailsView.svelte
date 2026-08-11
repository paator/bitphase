<script lang="ts">
	import type { ChipProcessor } from '../../chips/base/processor';
	import type { ChipSetting } from '../../chips/base/schema';
	import {
		buildChipSettingsContext,
		collectSettingSideEffects,
		normalizeChipSettingsRecord,
		resolveChipSettingDisplayValue
	} from '../../chips/base/chip-settings';
	import type { Song } from '../../models/song';
	import { PROJECT_FIELDS } from '../../models/project-fields';
	import { getChipByType } from '../../chips/registry';
	import Card from '../Card/Card.svelte';
	import CardElement from '../Card/CardElement.svelte';
	import DynamicField from './DynamicField.svelte';
	import IconCarbonChip from '~icons/carbon/chip';
	import IconCarbonFolders from '~icons/carbon/folders';
	import { getContext } from 'svelte';
	import type { AudioService } from '../../services/audio/audio-service';
	import { projectStore } from '../../stores/project.svelte';

	let {
		chipProcessors,
		onChipSettingsApplied
	}: {
		chipProcessors: ChipProcessor[];
		onChipSettingsApplied?: () => void;
	} = $props();

	const songs = $derived(projectStore.songs);

	const services: { audioService: AudioService } = getContext('container');

	const songsByChipType = $derived.by(() => {
		const grouped = new Map<string, Song[]>();
		for (const song of songs) {
			if (!song.chipType) continue;
			if (!grouped.has(song.chipType)) {
				grouped.set(song.chipType, []);
			}
			grouped.get(song.chipType)!.push(song);
		}
		return Array.from(grouped.entries())
			.map(([chipType, songList]) => {
				const chip = getChipByType(chipType);
				return {
					chipType,
					songs: songList,
					chip,
					count: songList.length
				};
			})
			.filter((group) => group.chip !== null);
	});

	const chipsByType = $derived.by(() => {
		const grouped = new Map<string, ChipProcessor[]>();
		for (const processor of chipProcessors) {
			const type = processor.chip.type;
			if (!grouped.has(type)) {
				grouped.set(type, []);
			}
			grouped.get(type)!.push(processor);
		}
		return Array.from(grouped.entries()).map(([type, processors]) => ({
			type,
			processors,
			chip: processors[0].chip,
			count: processors.length
		}));
	});

	const projectSettings = $derived([
		...PROJECT_FIELDS,
		...chipsByType.flatMap(
			(group) => group.chip.schema.settings?.filter((s) => s.group === 'project') || []
		)
	]);

	const projectContextKeys = $derived([
		...new Set(projectSettings.flatMap((s) => s.dependsOn ?? []))
	] as string[]);

	let chipSettingOverrides = $state<Record<string, Record<string, unknown>>>({});
	let previousSongsRef = $state<Song[] | undefined>(undefined);
	let settingsHistorySnapshot = $state<Record<string, unknown>>({});
	$effect(() => {
		if (songs !== previousSongsRef) {
			previousSongsRef = songs;
			chipSettingOverrides = {};
			settingsHistorySnapshot = { ...projectStore.settings };
		}
	});

	let projectContextState = $state<Record<string, unknown>>({});
	$effect(() => {
		for (const key of projectContextKeys) {
			const v = songs[0];
			projectContextState[key] = v
				? Number((v as unknown as Record<string, unknown>)[key] ?? 50)
				: 50;
		}
	});
	const projectContext = $derived(projectContextState);

	function getDependsOnKey(setting: ChipSetting, context: Record<string, unknown>): string {
		if (!setting.dependsOn?.length) return setting.key;
		return setting.dependsOn.map((k) => String(context[k] ?? '')).join('-');
	}

	function handleSettingChange(key: string, value: unknown, setting: ChipSetting) {
		const beforeSettings = { ...settingsHistorySnapshot };
		const beforeSongs = projectStore.cloneForHistory(projectStore.songs);
		const normalized =
			setting.type === 'number' ? Number(value) || setting.defaultValue : value;
		for (const song of songs) {
			(song as unknown as Record<string, unknown>)[key] = normalized;
		}
		settingsHistorySnapshot = { ...projectStore.settings };
		projectStore.recordHistory(
			{
				type: 'settings.update',
				label: `Update ${setting.label}`,
				affectedDomains: ['settings', 'songs']
			},
			[
				projectStore.createSetDiff(['settings'], beforeSettings, projectStore.settings),
				projectStore.createSetDiff(['songs'], beforeSongs, projectStore.songs)
			]
		);
		if (setting.notifyAudioService) {
			for (const group of chipsByType) {
				const notifies = group.chip.schema.settings?.some(
					(s) => s.key === key && s.notifyAudioService
				);
				if (notifies) {
					services.audioService.chipSettings.forChip(group.type).set(key, normalized);
				}
			}
		}
	}

	function resolveAndPushTuningTable(chipType: string) {
		const chip = getChipByType(chipType);
		if (!chip?.schema.resolveTuningTable) return;
		const songsOfType = songs.filter((s) => s.chipType === chipType);
		if (songsOfType.length === 0) return;
		const song = songsOfType[0];
		const record = song as unknown as Record<string, unknown>;
		const table = chip.schema.resolveTuningTable(record);
		for (const s of songsOfType) {
			s.tuningTable = table;
		}
		services.audioService.chipSettings.forChip(chipType).set('tuningTable', [...table]);
	}

	function getChipSettingValue(chipType: string, key: string): unknown {
		const songsOfType = songs.filter((s) => s.chipType === chipType);
		if (songsOfType.length === 0) return undefined;
		return (songsOfType[0] as unknown as Record<string, unknown>)[key];
	}

	function sanitizeChipSettingValue(setting: ChipSetting, value: unknown): unknown {
		if (setting.type === 'select') {
			if (
				value === null ||
				value === undefined ||
				value === '' ||
				(typeof value === 'number' && !Number.isFinite(value))
			) {
				return setting.defaultValue;
			}
			if (typeof value === 'number') {
				if (setting.min !== undefined && value < setting.min) return setting.defaultValue;
				if (setting.max !== undefined && value > setting.max) return setting.defaultValue;
			}
			return value;
		}
		if (setting.type === 'number') {
			const n = Number(value);
			if (!Number.isFinite(n)) return setting.defaultValue ?? setting.min ?? 0;
			if (setting.min !== undefined && setting.max !== undefined) {
				return Math.min(setting.max, Math.max(setting.min, n));
			}
			if (setting.min !== undefined) return Math.max(setting.min, n);
			if (setting.max !== undefined) return Math.min(setting.max, n);
			return n;
		}
		return value;
	}

	function buildChipContext(
		chipType: string,
		chipSettings: ChipSetting[]
	): Record<string, unknown> {
		const values: Record<string, unknown> = {};
		for (const setting of chipSettings) {
			values[setting.key] = sanitizeChipSettingValue(
				setting,
				chipSettingOverrides[chipType]?.[setting.key] ??
					getChipSettingValue(chipType, setting.key) ??
					setting.defaultValue
			);
		}
		return buildChipSettingsContext(chipSettings, values);
	}

	function getChipSettingDisplayValue(
		chipType: string,
		setting: ChipSetting,
		context: Record<string, unknown>
	): unknown {
		const baseValue = sanitizeChipSettingValue(
			setting,
			chipSettingOverrides[chipType]?.[setting.key] ??
				getChipSettingValue(chipType, setting.key) ??
				setting.defaultValue
		);
		return resolveChipSettingDisplayValue(setting, baseValue, context);
	}

	function applyChipSettingValues(
		chipType: string,
		updates: Record<string, unknown>,
		chipSettings: ChipSetting[],
		processors: ChipProcessor[]
	) {
		const songsOfType = songs.filter((s) => s.chipType === chipType);
		for (const [updateKey, updateValue] of Object.entries(updates)) {
			const currentValue = getChipSettingValue(chipType, updateKey);
			const audioValue = services.audioService.chipSettings.forChip(chipType).get(updateKey);
			const updateSetting = chipSettings.find((s) => s.key === updateKey);
			const needsSongUpdate = songsOfType.some(
				(song) => (song as unknown as Record<string, unknown>)[updateKey] !== updateValue
			);
			const needsAudioUpdate =
				updateSetting?.notifyAudioService &&
				(currentValue !== updateValue || audioValue !== updateValue);
			if (!needsSongUpdate && !needsAudioUpdate) continue;

			if (needsSongUpdate) {
				for (const song of songsOfType) {
					(song as unknown as Record<string, unknown>)[updateKey] = updateValue;
				}
				chipSettingOverrides[chipType] = {
					...(chipSettingOverrides[chipType] ?? {}),
					[updateKey]: updateValue
				};
			}
			if (needsAudioUpdate) {
				for (const processor of processors) {
					processor.updateParameter(updateKey, updateValue);
				}
				services.audioService.chipSettings.forChip(chipType).set(updateKey, updateValue);
			}
		}
	}

	function syncChipSettingsToAudio(chipType: string, chipSettings: ChipSetting[]) {
		const chip = getChipByType(chipType);
		if (!chip) return;

		const songsOfType = songs.filter((s) => s.chipType === chipType);
		if (songsOfType.length === 0) return;

		const sourceRecord = songsOfType[0] as unknown as Record<string, unknown>;
		const normalized = normalizeChipSettingsRecord(chip.schema, sourceRecord);
		const processors = chipsByType.find((g) => g.type === chipType)?.processors || [];
		const updates: Record<string, unknown> = {};

		for (const setting of chipSettings.filter((s) => s.notifyAudioService)) {
			updates[setting.key] = sanitizeChipSettingValue(
				setting,
				normalized[setting.key] ?? sourceRecord[setting.key]
			);
		}

		applyChipSettingValues(chipType, updates, chipSettings, processors);
	}

	function handleChipSettingChange(
		chipType: string,
		key: string,
		value: unknown,
		setting: ChipSetting
	) {
		const beforeSongs = projectStore.cloneForHistory(projectStore.songs);
		const normalized = sanitizeChipSettingValue(setting, value);
		const songsOfType = songs.filter((s) => s.chipType === chipType);
		for (const song of songsOfType) {
			(song as unknown as Record<string, unknown>)[key] = normalized;
		}
		chipSettingOverrides[chipType] = {
			...(chipSettingOverrides[chipType] ?? {}),
			[key]: normalized
		};
		if (projectContextKeys.includes(key)) {
			projectContextState[key] = Number(normalized);
		}

		const chip = getChipByType(chipType);
		const chipSettings = chip?.schema.settings?.filter((s) => s.group === 'chip') ?? [];
		if (chip?.schema.tuningTableSettingKeys?.includes(key)) {
			resolveAndPushTuningTable(chipType);
			onChipSettingsApplied?.();
		}

		if (setting.notifyAudioService) {
			const processors = chipsByType.find((g) => g.type === chipType)?.processors || [];
			for (const processor of processors) {
				processor.updateParameter(key, normalized);
			}
			services.audioService.chipSettings.forChip(chipType).set(key, normalized);

			if (chip) {
				const context = buildChipContext(chipType, chipSettings);
				const sideEffects = collectSettingSideEffects(chip.schema, key, normalized, context);
				if (sideEffects.length > 0) {
					applyChipSettingValues(
						chipType,
						Object.fromEntries(sideEffects.map((effect) => [effect.key, effect.value])),
						chipSettings,
						processors
					);
					if (
						sideEffects.some((effect) =>
							chip.schema.tuningTableSettingKeys?.includes(effect.key)
						)
					) {
						resolveAndPushTuningTable(chipType);
						onChipSettingsApplied?.();
					}
				}
			}
		}
		projectStore.recordHistory(
			{
				type: 'chipSettings.update',
				label: `Update ${setting.label}`,
				affectedDomains: ['chipSettings', 'songs']
			},
			[projectStore.createSetDiff(['songs'], beforeSongs, projectStore.songs)]
		);
	}

	$effect(() => {
		songsByChipType.forEach((group) => {
			if (!group.chip) return;
			const chipSettings = group.chip.schema.settings?.filter((s) => s.group === 'chip') || [];
			syncChipSettingsToAudio(group.chipType, chipSettings);
			if (group.chip?.schema.resolveTuningTable) {
				resolveAndPushTuningTable(group.chipType);
			}
		});
	});
</script>

<div class="flex h-full flex-col gap-3 overflow-auto p-4">
	<Card title="Project Info" icon={IconCarbonFolders} class="flex w-full flex-col gap-2 p-3">
		<div class="flex flex-wrap gap-2">
			{#each projectSettings as setting}
				<div
					class={setting.fullWidth
						? 'w-full basis-full'
						: setting.type === 'toggle'
							? ''
							: 'flex-1'}>
					<CardElement label={setting.label}>
						{#key getDependsOnKey(setting, projectContext)}
							<DynamicField
								{setting}
								bind:value={projectStore.settings[setting.key]}
								context={projectContext}
								hintOverride={setting.computedHint
									? setting.computedHint(projectStore.settings[setting.key], projectContext)
									: undefined}
								onChange={handleSettingChange} />
						{/key}
					</CardElement>
				</div>
			{/each}
		</div>
	</Card>

	{#each songsByChipType as group}
		{#if group.chip}
			{@const chipSettings =
				group.chip.schema.settings?.filter((s) => s.group === 'chip') || []}
			{#if chipSettings.length > 0}
				<Card
					title="{group.chip.name} Settings{group.count > 1
						? ` (${group.count} songs)`
						: ''}"
					icon={IconCarbonChip}
					class="flex w-full flex-col gap-2 p-3">
					{#key songs}
						<div class="flex flex-wrap gap-2">
							{#each chipSettings as setting}
								{#if setting.startNewRow}
									<div class="h-0 min-h-0 w-full basis-full" aria-hidden="true">
									</div>
								{/if}
								{@const context = buildChipContext(group.chipType, chipSettings)}
								{@const currentValue = getChipSettingDisplayValue(
									group.chipType,
									setting,
									context
								)}
								{@const settingVisible =
									!setting.showWhen ||
									context[setting.showWhen.key] == setting.showWhen.value}
								{#if settingVisible}
									<div
										class={setting.fullWidth
											? 'w-full basis-full'
											: setting.type === 'toggle'
												? ''
												: 'flex-1'}>
										<CardElement label={setting.label}>
											<DynamicField
												{setting}
												value={currentValue}
												{context}
												onChange={(key, value, s) => {
													handleChipSettingChange(
														group.chipType,
														key,
														value,
														s
													);
												}} />
										</CardElement>
									</div>
								{/if}
							{/each}
						</div>
					{/key}
				</Card>
			{/if}
		{/if}
	{/each}

	{#if chipsByType.length === 0 || chipsByType.every((g) => (g.chip.schema.settings?.filter((s) => s.group === 'chip') || []).length === 0)}
		{#if projectSettings.length === PROJECT_FIELDS.length}
			<div class="flex h-full items-center justify-center">
				<p class="text-sm text-[var(--color-app-text-muted)]">
					No chip-specific settings available
				</p>
			</div>
		{/if}
	{/if}
</div>
