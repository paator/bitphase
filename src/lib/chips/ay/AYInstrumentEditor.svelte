<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';

	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonMusic from '~icons/carbon/music';
	import IconCarbonRenew from '~icons/carbon/renew';
	import IconCarbonSettingsAdjust from '~icons/carbon/settings-adjust';
	import PillTabs, { type PillTab } from '../../components/PillTabs/PillTabs.svelte';
	import { RowEditorNameField } from '../../components/RowEditorTable';
	import AYTimerWaveformDrawer from './AYTimerWaveformDrawer.svelte';
	import AYTimerPwmControls from './AYTimerPwmControls.svelte';
	import AYInstrumentSamplePanel from './AYInstrumentSamplePanel.svelte';
	import { AyTimerEffectsController } from './ay-timer-effects-controller.svelte.js';
	import { setAyTimerEffectsContext } from './ay-timer-effects-context';
	import { type AyInstrumentFields } from './instrument';
	import { instrumentHasSample } from './sample-region';
	import { AY_MIXER_MACRO_FIELDS } from './mixer-macros';
	import { AY_TIMER_MACRO_FIELDS } from './ay-timer-macros';
	import InstrumentMacrosEditor from '../../components/Instruments/InstrumentMacrosEditor.svelte';
	import InstrumentClassicModeToggle from '../../components/Instruments/InstrumentClassicModeToggle.svelte';
	import { settingsStore } from '../../stores/settings.svelte';
	import AYInstrumentClassicMixer from './AYInstrumentClassicMixer.svelte';
	import AYInstrumentClassicTimer from './AYInstrumentClassicTimer.svelte';
	import {
		instrumentMacroUpdates,
		resolveTimerInstrumentMacros,
		type InstrumentMacros
	} from '../../chips/base/instrument-macros';

	type InstrumentTab = 'mixer' | 'timer' | 'sample';
	type TimerInstrument = Instrument & { timerMacros?: InstrumentMacros };

	let {
		instrument,
		asHex = false,
		isExpanded = false,
		onInstrumentChange
	}: {
		instrument: Instrument;
		asHex: boolean;
		isExpanded: boolean;
		onInstrumentChange: (instrument: Instrument) => void;
	} = $props();

	let activeTab = $state<InstrumentTab>('mixer');

	const extendedInstrument = $derived(instrument as Instrument & Partial<AyInstrumentFields>);
	const hasSample = $derived(instrumentHasSample(extendedInstrument));
	const classicEditor = $derived(settingsStore.classicInstrumentEditor);

	const instrumentTabs = $derived.by((): PillTab[] => [
		{ id: 'mixer', label: 'Mixer', icon: IconCarbonVolumeUp, disabled: hasSample },
		{ id: 'timer', label: 'Timer Effects', icon: IconCarbonActivity, disabled: hasSample },
		{ id: 'sample', label: 'Sample', icon: IconCarbonWaveform }
	]);

	const mixerIcons = {
		volume: IconCarbonVolumeUp,
		tone: IconCarbonMusic,
		noise: IconCarbonWaveform,
		envelope: IconCarbonActivity,
		retriggerEnvelope: IconCarbonRepeat,
		toneAdd: IconCarbonChartWinLoss,
		toneAccumulation: IconCarbonRenew,
		noiseAdd: IconCarbonWaveform,
		noiseAccumulation: IconCarbonRenew,
		envelopeAdd: IconCarbonActivity,
		envelopeAccumulation: IconCarbonRenew,
		amplitudeSlide: IconCarbonArrowsVertical
	};

	const timerIcons = {
		sid: IconCarbonChartWinLoss,
		syncbuzzer: IconCarbonActivity,
		timerWaveform: IconCarbonWaveform,
		fm: IconCarbonMusic,
		fmOffsetMode: IconCarbonSettingsAdjust,
		fmWaveform: IconCarbonWaveform,
		envFm: IconCarbonRepeat,
		envFmOffsetMode: IconCarbonSettingsAdjust,
		envFmWaveform: IconCarbonWaveform,
		semitone: IconCarbonArrowsVertical,
		detune: IconCarbonArrowsVertical
	};

	const timerInstrument = $derived.by((): TimerInstrument => {
		const timerMacros = resolveTimerInstrumentMacros(
			instrument as TimerInstrument,
			AY_TIMER_MACRO_FIELDS
		);
		return { ...instrument, timerMacros, macros: timerMacros };
	});

	function commitTimerMacros(updated: Instrument): void {
		const incoming = updated.macros as InstrumentMacros;
		const prevMacros = timerInstrument.timerMacros as InstrumentMacros;

		const resolvedSid = incoming['sid']!;
		const resolvedSync = incoming['syncbuzzer']!;
		const sidValues = resolvedSid.values.map((sid, i) => {
			const sync = Boolean(resolvedSync.values[i]);
			if (!Boolean(sid) || !sync) return Boolean(sid);
			const prevSid = Boolean(prevMacros['sid']?.values[i]);
			return prevSid === Boolean(sid) ? false : Boolean(sid);
		});
		const syncValues = resolvedSync.values.map((sync, i) => {
			const sid = Boolean(sidValues[i]);
			if (!Boolean(sync) || !sid) return Boolean(sync);
			return false;
		});

		const timerMacros = instrumentMacroUpdates(
			{
				...incoming,
				sid: { ...resolvedSid, values: sidValues },
				syncbuzzer: { ...resolvedSync, values: syncValues }
			},
			AY_TIMER_MACRO_FIELDS
		).macros;

		onInstrumentChange({
			...instrument,
			timerMacros
		} as TimerInstrument);
		timerEffects.syncFromInstrument({ ...instrument, timerMacros } as TimerInstrument);
	}

	const timerEffects = new AyTimerEffectsController(
		() => instrument,
		(next) => onInstrumentChange(next),
		() => asHex
	);
	setAyTimerEffectsContext(timerEffects);

	$effect(() => {
		timerEffects.handleInstrumentChange(instrument);
	});

	$effect(() => {
		if (hasSample && activeTab !== 'sample') {
			activeTab = 'sample';
			timerEffects.closeWaveformEditor();
		}
	});
</script>

<div class="w-full max-w-full min-w-0 overflow-x-auto outline-none focus:outline-none" tabindex="-1">
	<RowEditorNameField
		bind:name={
			() => instrument.name,
			(value) => {
				if (value === instrument.name) return;
				onInstrumentChange({ ...instrument, name: value });
			}
		} />

	<div class="mt-3 ml-2 mr-2 flex items-center justify-between gap-2">
		<PillTabs
			bind:activeTabId={activeTab}
			tabs={instrumentTabs}
			onSelect={(tabId) => {
				if (tabId === 'sample') {
					timerEffects.closeWaveformEditor();
				}
			}} />
		<InstrumentClassicModeToggle />
	</div>

	{#if activeTab === 'timer' && timerEffects.waveformEditorRowIndex !== null}
		<AYTimerWaveformDrawer rowIndex={timerEffects.waveformEditorRowIndex} {isExpanded} />
	{/if}

	{#if activeTab === 'sample'}
		<div class="mt-3 mr-2 ml-2 box-border min-w-0">
			<AYInstrumentSamplePanel {instrument} {isExpanded} {onInstrumentChange} />
		</div>
	{:else if activeTab === 'mixer'}
		{#if classicEditor}
			<AYInstrumentClassicMixer {instrument} {asHex} {isExpanded} {onInstrumentChange} />
		{:else}
			<InstrumentMacrosEditor
				{instrument}
				fields={AY_MIXER_MACRO_FIELDS}
				{asHex}
				{isExpanded}
				icons={mixerIcons}
				{onInstrumentChange} />
		{/if}
	{:else if classicEditor}
		<AYInstrumentClassicTimer {isExpanded} />
	{:else}
		<InstrumentMacrosEditor
			instrument={timerInstrument}
			fields={AY_TIMER_MACRO_FIELDS}
			{asHex}
			{isExpanded}
			icons={timerIcons}
			onInstrumentChange={commitTimerMacros}
			onStepClick={(fieldId, index) => {
				const macros = timerInstrument.timerMacros as InstrumentMacros;
				if (fieldId === 'sid' || fieldId === 'syncbuzzer' || fieldId === 'timerWaveform') {
					const sidActive = Boolean(macros['sid']?.values[index]);
					const syncActive = Boolean(macros['syncbuzzer']?.values[index]);
					if (sidActive || syncActive) {
						timerEffects.setTimerEditPanel('mix');
						timerEffects.openWaveformEditor(index);
					}
				} else if (fieldId === 'fm' || fieldId === 'fmWaveform') {
					if (Boolean(macros['fm']?.values[index])) {
						timerEffects.setTimerEditPanel('fm');
						timerEffects.openWaveformEditor(index);
					}
				} else if (fieldId === 'envFm' || fieldId === 'envFmWaveform') {
					if (Boolean(macros['envFm']?.values[index])) {
						timerEffects.setTimerEditPanel('envFm');
						timerEffects.openWaveformEditor(index);
					}
				}
			}}
			isStepEnabled={(fieldId, index) => {
				const macros = timerInstrument.timerMacros as InstrumentMacros;
				if (fieldId === 'timerWaveform') {
					return (
						Boolean(macros['sid']?.values[index]) ||
						Boolean(macros['syncbuzzer']?.values[index])
					);
				}
				if (fieldId === 'fmWaveform') {
					return Boolean(macros['fm']?.values[index]);
				}
				if (fieldId === 'envFmWaveform') {
					return Boolean(macros['envFm']?.values[index]);
				}
				return true;
			}} />
		<div class="mx-2 mt-2">
			<AYTimerPwmControls {isExpanded} />
		</div>
	{/if}
</div>
