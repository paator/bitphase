<script lang="ts">
	import type { Instrument } from '../../models/song';
	import { RowEditorNameField } from '../RowEditorTable';
	import InstrumentColorField from './InstrumentColorField.svelte';

	let {
		instrument,
		onInstrumentChange
	}: {
		instrument: Instrument;
		onInstrumentChange: (instrument: Instrument) => void;
	} = $props();

	function setName(name: string): void {
		if (name === instrument.name) return;
		onInstrumentChange({ ...instrument, name });
	}

	function setColor(color: string | undefined): void {
		if (color === instrument.color) return;
		if (color) {
			onInstrumentChange({ ...instrument, color });
			return;
		}
		const next = { ...instrument };
		delete next.color;
		onInstrumentChange(next);
	}
</script>

<RowEditorNameField
	bind:name={
		() => instrument.name,
		(value) => setName(value)
	}>
	<InstrumentColorField color={instrument.color} onColorChange={setColor} />
</RowEditorNameField>
