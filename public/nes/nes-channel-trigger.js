/** @param {boolean} active @param {boolean} retrigger @param {boolean} wasEnabled */
export function channelKeyOn(active, retrigger, wasEnabled) {
	return Boolean(active && (retrigger || !wasEnabled));
}
