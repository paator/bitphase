/**
 * @typedef {Object} SharedPlaybackSlot
 * @property {number} [chipIndex]
 * @property {() => number} [getLeaderPatternRowCount]
 * @property {() => void} runSharedPlaybackQuantum
 * @property {(needsChange: boolean) => void} [onPatternOrderAdvanced]
 */

/**
 * @param {SharedPlaybackSlot[]} playSlots
 */
export function sortPlaySlotsForQuantum(playSlots) {
	return [...playSlots].sort((a, b) => (b.chipIndex ?? 0) - (a.chipIndex ?? 0));
}

/**
 * @param {SharedPlaybackSlot[]} slots
 */
export function leaderPatternLengthFromSlots(slots) {
	/** @param {SharedPlaybackSlot} slot */
	const rowCount = (slot) =>
		typeof slot.getLeaderPatternRowCount === 'function' ? slot.getLeaderPatternRowCount() : 0;
	const s0 = slots[0];
	let n = s0 ? rowCount(s0) : 0;
	if (n > 0) return n;
	for (let i = 0; i < slots.length; i++) {
		const s = slots[i];
		if (!s) continue;
		const len = rowCount(s);
		if (len > 0) return len;
	}
	return 1;
}

/**
 * @param {SharedPlaybackSlot[]} playSlots
 * @param {SharedPlaybackSlot[]} allSlots
 * @param {{ advancePosition: (leaderLen: number) => boolean }} timeline
 * @param {number} leaderLen
 */
export function runSharedTimelineQuantum(playSlots, allSlots, timeline, leaderLen) {
	for (const slot of playSlots) {
		slot.runSharedPlaybackQuantum();
	}
	const needsOrderWrap = timeline.advancePosition(leaderLen);
	for (const slot of allSlots) {
		if (slot.onPatternOrderAdvanced) {
			slot.onPatternOrderAdvanced(needsOrderWrap);
		}
	}
	return needsOrderWrap;
}
