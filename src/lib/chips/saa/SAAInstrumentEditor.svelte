<script lang="ts">
	import type { Instrument } from '../../models/song';
	import IconCarbonVolumeUp from '~icons/carbon/volume-up';
	import IconCarbonArrowsVertical from '~icons/carbon/arrows-vertical';
	import IconCarbonMusic from '~icons/carbon/music';
	import IconCarbonWaveform from '~icons/carbon/waveform';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonRenew from '~icons/carbon/renew';
	import InstrumentEditorIdentity from '../../components/Instruments/InstrumentEditorIdentity.svelte';
	import InstrumentMacrosEditor from '../../components/Instruments/InstrumentMacrosEditor.svelte';
	import { SAA_VOLUME_MACRO_FIELDS } from './volume-macros';

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

	const icons = {
		left: IconCarbonVolumeUp,
		right: IconCarbonVolumeUp,
		amplitudeSlide: IconCarbonArrowsVertical,
		tone: IconCarbonMusic,
		toneAdd: IconCarbonChartWinLoss,
		toneAccumulation: IconCarbonRenew,
		noise: IconCarbonWaveform,
		noiseAdd: IconCarbonWaveform,
		noiseAccumulation: IconCarbonRenew
	};
</script>

<div class="w-full max-w-full min-w-0 overflow-x-auto outline-none focus:outline-none" tabindex="-1">
	<InstrumentEditorIdentity {instrument} {onInstrumentChange} />
	<InstrumentMacrosEditor
		{instrument}
		fields={SAA_VOLUME_MACRO_FIELDS}
		{asHex}
		{isExpanded}
		{icons}
		{onInstrumentChange} />
</div>
