const WAVEFORM_NAMES = [
	'',
	'Hold',
	'Decay once',
	'Decay, repeating',
	'Attack once',
	'Attack, repeating',
	'Triangle once',
	'Triangle, repeating',
	'On, silent'
];

export function describeSaaEnvelope(value: number): string {
	if (value === 0) return 'blank, keeps current';
	if (value === -1) return 'off';
	const waveform = (value >> 4) & 0xf;
	const variant = value & 0xf;
	if (waveform < 1 || waveform > 8 || variant > 3) return 'unused, keeps current';
	const steps = (variant & 2) !== 0 ? '8 steps' : '16 steps';
	const right = (variant & 1) !== 0 ? 'right flipped' : 'right normal';
	return `${WAVEFORM_NAMES[waveform]}, ${steps}, ${right}`;
}
