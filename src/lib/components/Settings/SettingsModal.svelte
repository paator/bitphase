<script lang="ts">
	import {
		settingsItems,
		generalSettings,
		keyboardSettings,
		ayYmSettings
	} from '../../config/settings';
	import { settingsStore } from '../../stores/settings.svelte';
	import type { Settings, SettingsTabState } from './types';
	import Button from '../Button/Button.svelte';
	import ConfirmModal from '../Modal/ConfirmModal.svelte';
	import { ModalPanel } from '../ModalPanel';
	import { open } from '../../services/modal/modal-service';
	import { midiService, type MidiInputInfo } from '../../services/midi/midi-service';
	import { TabView } from '../TabView';
	import AppearanceSettings from './AppearanceSettings.svelte';
	import KeyboardSettings from './KeyboardSettings.svelte';
	import SettingField from './SettingField.svelte';
	import { FormField } from '../FormField';
	import { NativeSelect } from '../NativeSelect';

	let { resolve, dismiss, onCloseRef, initialTabId } = $props<{
		resolve?: (value?: any) => void;
		dismiss?: (error?: any) => void;
		onCloseRef?: { current: (() => void) | null };
		initialTabId?: string;
	}>();

	const currentSettings: Settings = {
		volume: settingsStore.volume,
		envelopeAsNote: settingsStore.envelopeAsNote,
		autoEnterInstrument: settingsStore.autoEnterInstrument,
		midiInputDeviceId: settingsStore.midiInputDeviceId,
		patternEditorFontSize: settingsStore.patternEditorFontSize,
		patternEditorFontFamily: settingsStore.patternEditorFontFamily,
		uiFontFamily: settingsStore.uiFontFamily,
		channelSeparatorWidth: settingsStore.channelSeparatorWidth,
		decimalRowNumbers: settingsStore.decimalRowNumbers,
		showOscilloscopes: settingsStore.showOscilloscopes,
		showChannelVolumeBars: settingsStore.showChannelVolumeBars,
		showInstrumentPreview: settingsStore.showInstrumentPreview,
		previewFullRow: settingsStore.previewFullRow,
		debugMode: settingsStore.debugMode,
		selectionStyle: settingsStore.selectionStyle,
		emptyNoteAlignment: settingsStore.emptyNoteAlignment
	};
	let tempSettings = $state<Settings>({ ...currentSettings });
	let activeTabId = $state(initialTabId || 'general');
	let keyboardTabState = $state<SettingsTabState | null>(null);
	let midiDevices = $state<MidiInputInfo[]>([]);
	let midiRequestingAccess = $state(false);

	const midiSelectedIdNotInList = $derived(
		tempSettings.midiInputDeviceId &&
			!midiDevices.some((d) => d.id === tempSettings.midiInputDeviceId)
	);

	const hasUnsavedChanges = $derived(
		settingsItems.some(
			(item) => tempSettings[item.setting] !== currentSettings[item.setting]
		) ||
			(keyboardTabState?.hasUnsavedValue ?? false)
	);

	const hasTabConflicts = $derived(keyboardTabState?.hasConflictsValue ?? false);

	const tabs = [
		{ id: 'general', label: 'General' },
		{ id: 'keyboard', label: 'Keyboard' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'ayYm', label: 'AY/YM' }
	];

	async function requestMidiAccessAndLoadDevices() {
		if (!midiService.isSupported() || midiRequestingAccess) return;
		midiRequestingAccess = true;
		try {
			const ok = await midiService.requestAccess();
			if (ok) {
				midiDevices = midiService.getInputs();
				midiService.setSelectedInputId(
					tempSettings.midiInputDeviceId || null
				);
			}
		} finally {
			midiRequestingAccess = false;
		}
	}

	function handleSave() {
		if (hasTabConflicts) return;
		for (const item of settingsItems) {
			settingsStore.set(item.setting, tempSettings[item.setting]);
		}
		midiService.setSelectedInputId(
			tempSettings.midiInputDeviceId || null
		);
		resolve?.();
	}

	async function handleDismiss() {
		if (hasUnsavedChanges) {
			const confirmed = await open(ConfirmModal, {
				message: 'You have unsaved changes. Are you sure you want to close settings?'
			});
			if (confirmed) {
				keyboardTabState?.revert();
				dismiss?.();
			}
		} else {
			dismiss?.();
		}
	}

	$effect.pre(() => {
		if (onCloseRef) {
			onCloseRef.current = handleDismiss;
		}
	});

	$effect(() => {
		if (activeTabId === 'keyboard' && midiService.hasAccess()) {
			midiDevices = midiService.getInputs();
		}
	});
</script>

<ModalPanel
	title="Settings"
	width="w-[600px]"
	height="h-[600px]"
	bodyClass="flex min-h-0 flex-1 flex-col overflow-hidden">
	{#snippet children()}
		<TabView {tabs} bind:activeTabId>
			{#snippet children(tabId)}
				<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
					{#if tabId === 'general'}
						{#each generalSettings as item (item.setting)}
							<SettingField {item} bind:tempSettings />
						{/each}
					{:else if tabId === 'keyboard'}
						<div class="flex flex-col gap-4">
							<KeyboardSettings registerState={(state) => (keyboardTabState = state)} />
							{#each keyboardSettings.filter((s) => s.setting !== 'midiInputDeviceId') as item (item.setting)}
								<SettingField {item} bind:tempSettings />
							{/each}
							<FormField
								id="setting-midiInputDeviceId"
								label="MIDI device"
								description="Select the MIDI keyboard to use. Connect and choose a device, then save.">
								<div class="flex flex-col gap-1">
									<NativeSelect
										id="setting-midiInputDeviceId"
										bind:value={tempSettings.midiInputDeviceId}
										class="w-full max-w-xs"
										placeholder="No device selected"
										options={[
											...(midiSelectedIdNotInList
												? [
														{
															label: 'Selected device (load list to confirm)',
															value: tempSettings.midiInputDeviceId
														}
													]
												: []),
											...midiDevices.map((device) => ({
												label: device.name,
												value: device.id
											}))
										]} />
									<button
										type="button"
										class="w-fit cursor-pointer text-xs text-[var(--color-app-primary)] hover:underline disabled:opacity-50"
										disabled={midiRequestingAccess || !midiService.isSupported()}
										onclick={requestMidiAccessAndLoadDevices}>
										{midiRequestingAccess ? 'Connecting…' : 'Load MIDI devices'}
									</button>
								</div>
							</FormField>
						</div>
					{:else if tabId === 'appearance'}
						<AppearanceSettings onCloseSettings={dismiss} bind:tempSettings />
					{:else if tabId === 'ayYm'}
						{#each ayYmSettings as item (item.setting)}
							<SettingField {item} bind:tempSettings />
						{/each}
					{/if}
				</div>
			{/snippet}
		</TabView>
	{/snippet}

	{#snippet footer()}
		<Button variant="secondary" onclick={handleDismiss}>Dismiss</Button>
		<Button variant="primary" onclick={handleSave} disabled={hasTabConflicts}>Save</Button>
	{/snippet}
</ModalPanel>
