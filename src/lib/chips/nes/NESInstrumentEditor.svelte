<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonRepeat from '~icons/carbon/repeat';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonActivity from '~icons/carbon/activity';
	import IconCarbonMusic from '~icons/carbon/music';
	import IconCarbonRenew from '~icons/carbon/renew';
	import IconCarbonSettingsAdjust from '~icons/carbon/settings-adjust';
	import IconCarbonTime from '~icons/carbon/time';
	import { RowEditorNameField } from '../../components/RowEditorTable';
	import type { NESInstrumentFields } from './instrument';
	import PillTabs, { type PillTab } from '../../components/PillTabs/PillTabs.svelte';
	import NESInstrumentSamplePanel from './NESInstrumentSamplePanel.svelte';
	import { instrumentHasSample } from '../ay/sample-region';
	import { NES_APU_MACRO_FIELDS } from './apu-macros';
	import InstrumentMacrosEditor from '../../components/Instruments/InstrumentMacrosEditor.svelte';

	type InstrumentTab = 'apu' | 'dpcm';

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

	let activeTab = $state<InstrumentTab>('apu');

	const extendedInstrument = $derived(instrument as Instrument & Partial<NESInstrumentFields>);
	const hasSample = $derived(instrumentHasSample(extendedInstrument));

	const instrumentTabs = $derived.by((): PillTab[] => [
		{ id: 'apu', label: 'APU', icon: IconCarbonVolumeUp, disabled: hasSample },
		{ id: 'dpcm', label: 'DPCM', icon: IconCarbonWaveform }
	]);

	const apuIcons = {
		volumeOrRate: IconCarbonVolumeUp,
		envelope: IconCarbonActivity,
		retrigger: IconCarbonRepeat,
		pulseWidth: IconCarbonChartWinLoss,
		toneAdd: IconCarbonMusic,
		toneAccumulation: IconCarbonRenew,
		sweep: IconCarbonSettingsAdjust,
		sweepRate: IconCarbonTime,
		sweepShift: IconCarbonArrowsVertical,
		soundLength: IconCarbonTime
	};

	$effect(() => {
		if (hasSample && activeTab !== 'dpcm') {
			activeTab = 'dpcm';
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

	<PillTabs
		class="mt-3 ml-2"
		bind:activeTabId={activeTab}
		tabs={instrumentTabs}
		onSelect={(tabId) => {
			activeTab = tabId as InstrumentTab;
		}} />

	{#if activeTab === 'dpcm'}
		<div class="mt-3 mr-2 ml-2 box-border min-w-0">
			<NESInstrumentSamplePanel {instrument} {isExpanded} {onInstrumentChange} />
		</div>
	{:else}
		<InstrumentMacrosEditor
			{instrument}
			fields={NES_APU_MACRO_FIELDS}
			{asHex}
			{isExpanded}
			icons={apuIcons}
			{onInstrumentChange} />
	{/if}
</div>
