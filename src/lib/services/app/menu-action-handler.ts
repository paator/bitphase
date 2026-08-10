import { Project } from '../../models/project';
import { Pattern } from '../../models/song';
import { undoRedoStore } from '../../stores/undo-redo.svelte';
import ConfirmModal from '../../components/Modal/ConfirmModal.svelte';
import SettingsModal from '../../components/Settings/SettingsModal.svelte';
import AboutModal from '../../components/Modal/AboutModal.svelte';
import TmrCheckerModal from '../../components/Modal/TmrCheckerModal.svelte';
import EffectsModal from '../../components/Modal/EffectsModal.svelte';
import UserScriptsModal from '../../components/Modal/UserScriptsModal.svelte';
import WavExportSettingsModal from '../../components/Modal/WavExportSettingsModal.svelte';
import ProgressModal from '../../components/Modal/ProgressModal.svelte';
import {
	ACTION_APPLY_SCRIPT,
	ACTION_PLAY_FROM_BEGINNING,
	ACTION_PLAY_FROM_CURSOR,
	ACTION_PLAY_FROM_ROW,
	ACTION_PLAY_PATTERN,
	ACTION_TOGGLE_AUTO_ENVELOPE,
	ACTION_TOGGLE_ENVELOPE_AS_NOTE,
	ACTION_TOGGLE_PLAYBACK,
	ACTION_TOGGLE_EXPAND_PANEL
} from '../../config/keybindings';
import { autoEnvStore } from '../../stores/auto-env.svelte';
import { editorStateStore } from '../../stores/editor-state.svelte';
import { loadDemoProject } from '../../config/demo-songs';
import { AY_CHIP } from '../../chips/ay';
import { NES_CHIP } from '../../chips/nes';
import type { Chip } from '../../chips/types';
import type { MenuActionContext } from './menu-action-context';
import { projectStore } from '../../stores/project.svelte';

async function createNewSongFromMenu(ctx: MenuActionContext, chip: Chip): Promise<void> {
	ctx.playbackStore.isPlaying = false;
	ctx.container.audioService.stop();
	const project = ctx.getCurrentProject();
	const newSong = await ctx.projectService.createNewSong(chip, project.songs);
	newSong.defaultPatternLength = projectStore.getDefaultPatternLength();
	if (project.patternOrder.length > 0) {
		const refPatterns = project.songs[0]?.patterns ?? [];
		const schema = newSong.getSchema() ?? chip.schema;
		const uniquePatternIds = [...new Set(project.patternOrder)];
		newSong.patterns = uniquePatternIds.map((id) => {
			const refPattern = refPatterns.find((p) => p.id === id);
			const length = refPattern?.length ?? newSong.defaultPatternLength;
			return new Pattern(id, length, schema);
		});
	}
	ctx.addSong(newSong);
	ctx.resetPatternEditor();
}

function dispatchEditorKey(
	patternEditor: MenuActionContext['getPatternEditor'],
	key: string,
	modifiers?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; code?: string }
) {
	const editor = patternEditor();
	const event = new KeyboardEvent('keydown', {
		key,
		code: modifiers?.code ?? key,
		ctrlKey: modifiers?.ctrlKey ?? false,
		shiftKey: modifiers?.shiftKey ?? false,
		altKey: modifiers?.altKey ?? false,
		bubbles: true
	});
	editor?.handleKeyDownFromMenu?.(event);
}

export function createMenuActionHandler(ctx: MenuActionContext) {
	return async function handleMenuAction(data: { action: string; songIndex?: number }) {
		try {
			const patternEditor = ctx.getPatternEditor();

			if (data.action === 'undo') {
				if (!ctx.playbackStore.isPlaying) undoRedoStore.undo();
				return;
			}

			if (data.action === 'redo') {
				if (!ctx.playbackStore.isPlaying) undoRedoStore.redo();
				return;
			}

			if (data.action === 'copy') {
				dispatchEditorKey(ctx.getPatternEditor, 'c', { ctrlKey: true });
				return;
			}

			if (data.action === 'cut') {
				dispatchEditorKey(ctx.getPatternEditor, 'x', { ctrlKey: true });
				return;
			}

			if (data.action === 'paste') {
				dispatchEditorKey(ctx.getPatternEditor, 'v', { ctrlKey: true });
				return;
			}

			if (data.action === 'paste-without-erasing') {
				dispatchEditorKey(ctx.getPatternEditor, 'v', { ctrlKey: true, shiftKey: true });
				return;
			}

			if (data.action === 'increment-value') {
				dispatchEditorKey(ctx.getPatternEditor, '+');
				return;
			}

			if (data.action === 'decrement-value') {
				dispatchEditorKey(ctx.getPatternEditor, '-');
				return;
			}

			if (data.action === 'transpose-octave-up') {
				dispatchEditorKey(ctx.getPatternEditor, '+', { shiftKey: true });
				return;
			}

			if (data.action === 'transpose-octave-down') {
				dispatchEditorKey(ctx.getPatternEditor, '-', { shiftKey: true });
				return;
			}

			if (data.action === 'swap-channel-left') {
				dispatchEditorKey(ctx.getPatternEditor, 'ArrowLeft', {
					ctrlKey: true,
					altKey: true,
					code: 'ArrowLeft'
				});
				return;
			}

			if (data.action === 'swap-channel-right') {
				dispatchEditorKey(ctx.getPatternEditor, 'ArrowRight', {
					ctrlKey: true,
					altKey: true,
					code: 'ArrowRight'
				});
				return;
			}

			if (data.action === 'insert-pattern-row') {
				dispatchEditorKey(ctx.getPatternEditor, 'i', { ctrlKey: true, code: 'KeyI' });
				return;
			}

			if (data.action === 'remove-pattern-row') {
				dispatchEditorKey(ctx.getPatternEditor, 'r', { ctrlKey: true, code: 'KeyR' });
				return;
			}

			if (data.action === 'playFromBeginning' || data.action === ACTION_PLAY_FROM_BEGINNING) {
				if (ctx.playbackStore.isPlaying) {
					ctx.playbackStore.isPlaying = false;
					ctx.container.audioService.stop();
				}
				if (patternEditor) {
					ctx.playbackStore.isPlaying = true;
					patternEditor.resetToBeginning?.();
					patternEditor.togglePlayback?.();
				}
				return;
			}

			if (
				data.action === 'playFromCursor' ||
				data.action === ACTION_PLAY_FROM_ROW ||
				data.action === ACTION_PLAY_FROM_CURSOR
			) {
				if (ctx.playbackStore.isPlaying) return;
				if (patternEditor) {
					ctx.playbackStore.isPlaying = true;
					patternEditor.playFromCursor?.();
				}
				return;
			}

			if (data.action === 'togglePlayback' || data.action === ACTION_TOGGLE_PLAYBACK) {
				ctx.playbackStore.isPlaying = !ctx.playbackStore.isPlaying;
				if (ctx.playbackStore.isPlaying) {
					patternEditor?.togglePlayback?.();
				} else {
					ctx.container.audioService.stop();
				}
				return;
			}

			if (data.action === 'playPattern' || data.action === ACTION_PLAY_PATTERN) {
				if (ctx.playbackStore.isPlaying) {
					ctx.playbackStore.isPlaying = false;
					ctx.container.audioService.stop();
				}
				if (patternEditor) {
					ctx.playbackStore.isPlaying = true;
					patternEditor.playPattern?.();
				}
				return;
			}

			if (data.action === 'new-project') {
				ctx.playbackStore.isPlaying = false;
				ctx.container.audioService.stop();
				await ctx.clearAutobackup();
				const newProject = await ctx.projectService.resetProject();
				ctx.applyProject(newProject);
				ctx.resetPatternEditor();
				return;
			}

			if (data.action === 'remove-song' && typeof data.songIndex === 'number') {
				const index = data.songIndex;
				if (index < 0 || index >= ctx.getSongsLength()) return;
				const confirmed = await ctx.open(ConfirmModal, {
					message: `Remove song (${index + 1})? This cannot be undone.`
				});
				if (!confirmed) return;
				ctx.playbackStore.isPlaying = false;
				ctx.container.audioService.stop();
				ctx.removeSong(index);
				ctx.setActiveSongIndex(
					Math.min(ctx.getActiveSongIndex(), Math.max(0, ctx.getSongsLength() - 1))
				);
				ctx.resetPatternEditor();
				return;
			}

			if (data.action === 'new-song-ay') {
				await createNewSongFromMenu(ctx, AY_CHIP);
				return;
			}

			if (data.action === 'new-song-nes') {
				await createNewSongFromMenu(ctx, NES_CHIP);
				return;
			}

			if (data.action === 'settings') {
				await ctx.open(SettingsModal, {});
				return;
			}

			if (data.action === 'appearance') {
				await ctx.open(SettingsModal, { initialTabId: 'appearance' });
				return;
			}

			if (data.action === 'documentation') {
				window.open('/docs/', '_blank', 'noopener,noreferrer');
				return;
			}

			if (data.action === 'about') {
				await ctx.open(AboutModal, {});
				return;
			}

			if (data.action === 'tmr-checker') {
				await ctx.open(TmrCheckerModal, {});
				return;
			}

			if (data.action === 'effects') {
				await ctx.open(EffectsModal, {});
				return;
			}

			if (data.action === ACTION_APPLY_SCRIPT) {
				const hasSelection = patternEditor?.hasSelection?.() ?? false;
				const result = await ctx.open(UserScriptsModal, { hasSelection });
				if (result && patternEditor?.applyScript) {
					patternEditor.applyScript(result);
				}
				return;
			}

			if (data.action === ACTION_TOGGLE_AUTO_ENVELOPE) {
				autoEnvStore.toggle();
				return;
			}

			if (data.action === ACTION_TOGGLE_ENVELOPE_AS_NOTE) {
				editorStateStore.setEnvelopeAsNote(!editorStateStore.envelopeAsNote);
				return;
			}

			if (data.action === ACTION_TOGGLE_EXPAND_PANEL) {
				ctx.toggleExpandPanel();
				return;
			}

			if (data.action === 'save' || data.action === 'save-as') {
				await ctx.handleFileExport(data.action, ctx.getCurrentProject());
				return;
			}

			if (data.action === 'export-wav') {
				const currentProject = ctx.getCurrentProject();
				const wavSettings = await ctx.open(WavExportSettingsModal, {
					project: currentProject
				});
				if (wavSettings) {
					await ctx.open(ProgressModal, {
						project: currentProject,
						exportType: 'wav',
						wavSettings
					});
				}
				return;
			}

			if (data.action === 'export-psg') {
				await ctx.open(ProgressModal, {
					project: ctx.getCurrentProject(),
					exportType: 'psg'
				});
				return;
			}

			if (data.action === 'export-tmr' || data.action === 'export-tmr-zip') {
				await ctx.open(ProgressModal, {
					project: ctx.getCurrentProject(),
					exportType: 'tmr'
				});
				return;
			}

			if (data.action === 'export-psg-zip') {
				await ctx.open(ProgressModal, {
					project: ctx.getCurrentProject(),
					exportType: 'psg'
				});
				return;
			}

			if (data.action === 'export-sndh') {
				await ctx.open(ProgressModal, {
					project: ctx.getCurrentProject(),
					exportType: 'sndh'
				});
				return;
			}

			if (data.action === 'export-vgm') {
				await ctx.open(ProgressModal, {
					project: ctx.getCurrentProject(),
					exportType: 'vgm'
				});
				return;
			}

			if (data.action.startsWith('open-demo:')) {
				const path = data.action.slice('open-demo:'.length);
				const project = await loadDemoProject(path);
				if (project) {
					ctx.playbackStore.isPlaying = false;
					ctx.container.audioService.stop();
					await ctx.projectService.restoreChipProcessorsForSongs(project.songs);
					ctx.syncChipProcessors();
					ctx.applyProject(project);
					ctx.resetPatternEditor();
				}
				return;
			}

			const importedProject = await ctx.handleFileImport(data.action);
			if (importedProject) {
				ctx.playbackStore.isPlaying = false;
				ctx.container.audioService.stop();
				await ctx.projectService.restoreChipProcessorsForSongs(importedProject.songs);
				ctx.syncChipProcessors();
				ctx.applyProject(importedProject);
				ctx.resetPatternEditor();
			}
		} catch (error) {
			console.error('Failed to handle menu action:', error);
		}
	};
}
