export function channelKeyOn(active, retrigger, wasEnabled) {
	return Boolean(active && (retrigger || !wasEnabled));
}
