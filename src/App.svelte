<script lang="ts">
	import MenuBar from './lib/components/Menu/MenuBar.svelte';
	import './app.css';
	import { buildMenuItems } from './lib/config/app-menu';
	import { buildChipConfiguration } from './lib/config/export-formats';
	import { handleFileImport } from './lib/services/file/file-import';
	import { handleFileExport } from './lib/services/file/file-export';
	import type { Song } from './lib/models/song';
	import PatternEditor from './lib/components/Song/PatternEditor.svelte';
	import ModalContainer from './lib/components/Modal/ModalContainer.svelte';
	import { open } from './lib/services/modal/modal-service';
	import { setContext } from 'svelte';
	import { AudioService } from './lib/services/audio/audio-service';
	import { ProjectService } from './lib/services/project/project-service';
	import { AY_CHIP } from './lib/chips/ay';
	import { getChipByType } from './lib/chips/registry';
	import SongView from './lib/components/Song/SongView.svelte';
	import { playbackStore } from './lib/stores/playback.svelte';
	import { settingsStore } from './lib/stores/settings.svelte';
	import { editorStateStore } from './lib/stores/editor-state.svelte';
	import { themeStore } from './lib/stores/theme.svelte';
	import { themeService } from './lib/services/theme/theme-service';
	import { themeEditorStore } from './lib/stores/theme-editor.svelte';
	import ThemeEditorModal from './lib/components/Theme/ThemeEditorModal.svelte';
	import { tick } from 'svelte';
	import { keybindingsStore } from './lib/stores/keybindings.svelte';
	import { ShortcutString } from './lib/utils/shortcut-string';
	import {
		ACTION_PLAY_FROM_ROW,
		ACTION_OCTAVE_UP,
		ACTION_OCTAVE_DOWN,
		GLOBAL_ACTION_IDS
	} from './lib/config/keybindings';
	import { isEditableElement } from './lib/utils/shortcut-input-exclusion';
	import { autobackupService } from './lib/services/backup/autobackup-service';
	import { runAppBootstrap } from './lib/app-bootstrap';
	import { createMenuActionHandler } from './lib/services/app/menu-action-handler';
	import type { MenuActionContext } from './lib/services/app/menu-action-context';
	import { projectStore } from './lib/stores/project.svelte';
	import AlphaNoticeModal from './lib/components/Modal/AlphaNoticeModal.svelte';
	import { alphaNoticeStore } from './lib/stores/alpha-notice.svelte';

	runAppBootstrap();

	let alphaNoticeShownThisSession = $state(false);

	$effect(() => {
		if (!projectStore.initialized || alphaNoticeShownThisSession) return;
		if (alphaNoticeStore.hasSeen) return;
		alphaNoticeShownThisSession = true;
		open(AlphaNoticeModal, {});
	});

	let lastAppliedThemeId = $state<string | null>(null);

	$effect(() => {
		if ('serviceWorker' in navigator) {
			window.addEventListener('load', () => {
				navigator.serviceWorker.register('/sw.js');
			});
		}
	});

	$effect(() => {
		const activeThemeId = themeStore.activeThemeId;
		if (activeThemeId === lastAppliedThemeId) return;

		const activeTheme = themeStore.getActiveTheme();
		if (activeTheme) {
			lastAppliedThemeId = activeThemeId;
			themeService.applyTheme(activeTheme);
		}
	});

	let container: { audioService: AudioService } = $state({
		audioService: new AudioService()
	});

	const projectService = new ProjectService(container.audioService);

	container.audioService.addChipProcessor(AY_CHIP);

	$effect(() => {
		const volume = settingsStore.volume;
		container.audioService.setVolume(volume);
	});

	$effect(() => {
		const envelopeAsNote = settingsStore.envelopeAsNote;
		editorStateStore.setEnvelopeAsNote(envelopeAsNote);
	});

	$effect(() => {
		const uiFontFamily = settingsStore.uiFontFamily;
		if (uiFontFamily) {
			document.documentElement.style.setProperty(
				'--font-sans',
				`"${uiFontFamily}", sans-serif`
			);
			document.documentElement.style.setProperty(
				'--font-mono',
				`"${uiFontFamily}", monospace`
			);
		}
	});

	let activeSongIndex = $state(0);

	const menuItems = $derived.by(() => {
		const chipTypes = projectStore.songs
			.map((s) => s.chipType)
			.filter((t): t is string => t !== undefined);
		return buildMenuItems(buildChipConfiguration(chipTypes));
	});

	$effect(() => {
		if (projectStore.initialized) return;

		(async () => {
			const newProject = await projectService.resetProject(AY_CHIP);
			projectStore.applyProject(newProject);

			const backup = await autobackupService.getAutobackup();
			if (backup) {
				container.audioService.clearChipProcessors();
				for (const _ of backup.songs) {
					await container.audioService.addChipProcessor(AY_CHIP);
				}
				ProjectService.ensureChipSettingsConsistency(backup.songs);
				projectStore.applyProject(backup);
			}
			projectStore.initialized = true;
		})();
	});

	$effect(() => {
		if (!projectStore.initialized) return;
		projectStore.settings;
		projectStore.songs;
		projectStore.patterns;
		projectStore.patternOrder;
		projectStore.patternOrderColors;
		projectStore.tables;
		projectStore.instruments;
		autobackupService.saveAutobackup(projectStore.getCurrentProject());
	});

	$effect(() => {
		if (!projectStore.initialized) return;
		function saveOnUnload() {
			autobackupService.saveAutobackup(projectStore.getCurrentProject());
		}
		window.addEventListener('beforeunload', saveOnUnload);
		window.addEventListener('pagehide', saveOnUnload);
		return () => {
			window.removeEventListener('beforeunload', saveOnUnload);
			window.removeEventListener('pagehide', saveOnUnload);
		};
	});

	$effect(() => {
		container.audioService.updateTables(projectStore.tables);
	});

	$effect(() => {
		container.audioService.updateInstruments(projectStore.instruments);
	});

	$effect(() => {
		if (projectStore.songs.length === 0) return;

		ProjectService.ensureChipSettingsConsistency(projectStore.songs);

		const grouped = new Map<string, Song[]>();
		for (const song of projectStore.songs) {
			if (!song.chipType) continue;
			if (!grouped.has(song.chipType)) {
				grouped.set(song.chipType, []);
			}
			grouped.get(song.chipType)!.push(song);
		}

		grouped.forEach((songsOfType, chipType) => {
			if (songsOfType.length === 0) return;

			const firstSong = songsOfType[0] as unknown as Record<string, unknown>;
			const chip = getChipByType(chipType);
			if (!chip) return;

			const settings = chip.schema.settings || [];
			settings
				.filter((s) => s.group === 'chip' && s.notifyAudioService)
				.forEach((s) => {
					const value = firstSong[s.key] ?? s.defaultValue;
					if (value !== undefined) {
						container.audioService.chipSettings.set(s.key, value);
					}
				});
		});
	});

	let patternEditor: PatternEditor | null = $state(null);

	const menuActionContext: MenuActionContext = {
		getPatternEditor: () => patternEditor,
		getCurrentProject: () => projectStore.getCurrentProject(),
		applyProject: (project) => {
			ProjectService.ensureChipSettingsConsistency(project.songs);
			projectStore.applyProject(project);
		},
		removeSong: (index) => {
			projectStore.removeSong(index);
			container.audioService.removeChipProcessor(index);
		},
		addSong: (song) => {
			projectStore.addSong(song);
		},
		setActiveSongIndex: (index) => {
			activeSongIndex = index;
		},
		getSongsLength: () => projectStore.songs.length,
		getActiveSongIndex: () => activeSongIndex,
		container,
		projectService,
		playbackStore,
		open: open as MenuActionContext['open'],
		handleFileImport,
		handleFileExport,
		clearAutobackup: () => autobackupService.clearAutobackup(),
		resetPatternEditor: () => patternEditor?.resetToBeginning?.()
	};

	const handleMenuAction = createMenuActionHandler(menuActionContext);

	setContext('container', container);

	let enterPlayFromRowActive = $state(false);

	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (isEditableElement(event.target)) return;
		const shortcut = ShortcutString.fromEvent(event);
		const action = keybindingsStore.getActionForShortcut(shortcut);
		if (action !== null && GLOBAL_ACTION_IDS.has(action)) {
			event.preventDefault();
			if (action === ACTION_OCTAVE_UP) {
				if (editorStateStore.octave < 8) {
					editorStateStore.setOctave(editorStateStore.octave + 1);
				}
				return;
			}
			if (action === ACTION_OCTAVE_DOWN) {
				if (editorStateStore.octave > 0) {
					editorStateStore.setOctave(editorStateStore.octave - 1);
				}
				return;
			}
			if (action === ACTION_PLAY_FROM_ROW && !event.repeat) {
				enterPlayFromRowActive = true;
			}
			handleMenuAction({ action });
		}
	}

	function handleGlobalKeyUp(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		const shortcut = ShortcutString.fromEvent(event);
		const action = keybindingsStore.getActionForShortcut(shortcut);
		if (action !== ACTION_PLAY_FROM_ROW) return;
		const shouldStop =
			enterPlayFromRowActive || (patternEditor?.isEnterPlayFromRowActive?.() ?? false);
		if (shouldStop) {
			enterPlayFromRowActive = false;
			patternEditor?.clearEnterPlayFromRowState?.();
			playbackStore.isPlaying = false;
			container.audioService.stop();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeyDown} onkeyup={handleGlobalKeyUp} />

<main
	class="flex h-screen flex-col gap-1 overflow-hidden bg-[var(--color-app-surface-secondary)] font-sans text-xs text-[var(--color-app-text-primary)]">
	<MenuBar {menuItems} onAction={handleMenuAction} />
	<div class="flex-1 overflow-hidden">
		<SongView
			bind:patternEditor
			bind:activeEditorIndex={activeSongIndex}
			onaction={handleMenuAction}
			chipProcessors={container.audioService.chipProcessors} />
	</div>
	<ModalContainer />

	{#if themeEditorStore.editingTheme}
		<ThemeEditorModal
			theme={themeEditorStore.editingTheme.theme}
			isNew={themeEditorStore.editingTheme.isNew}
			resolve={async () => {
				const callback = themeEditorStore.onSaveCallback;
				themeEditorStore.setEditingTheme(null, false);
				await tick();
				callback?.();
			}}
			dismiss={() => {
				themeEditorStore.setEditingTheme(null, false);
			}} />
	{/if}
</main>
