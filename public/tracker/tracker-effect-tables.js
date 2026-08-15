import EffectAlgorithms from './effect-algorithms.js';

export function createChannelEffectTableSlots(channelCount) {
	return Array.from({ length: channelCount }, () => ({}));
}

export function resizeChannelEffectTableSlots(slots, newCount) {
	while (slots.length < newCount) slots.push({});
	if (slots.length > newCount) slots.length = newCount;
}

export function resetChannelEffectTableSlots(slots) {
	for (let index = 0; index < slots.length; index++) {
		slots[index] = {};
	}
}

export function clearAllEffectTableSlots(slots, channelIndex) {
	if (!slots[channelIndex]) return;
	slots[channelIndex] = {};
}

export function clearEffectTableSlot(slots, channelIndex, effectType) {
	if (!slots[channelIndex]) return;
	delete slots[channelIndex][effectType];
}

export function clearEffectTableSlotsExcept(slots, channelIndex, keepTypes) {
	const current = slots[channelIndex];
	if (!current) return;
	for (const key of Object.keys(current)) {
		if (!keepTypes.has(Number(key))) {
			delete current[key];
		}
	}
}

export function clearOtherSlideGroupTables(slots, channelIndex, keepType) {
	const current = slots[channelIndex];
	if (!current) return;
	for (const type of [
		EffectAlgorithms.SLIDE_UP,
		EffectAlgorithms.SLIDE_DOWN,
		EffectAlgorithms.PORTAMENTO
	]) {
		if (type !== keepType) {
			delete current[type];
		}
	}
}

export function initEffectTableSlot(slots, channelIndex, effect) {
	if (!slots[channelIndex]) {
		slots[channelIndex] = {};
	}
	slots[channelIndex][effect.effect] = {
		tableIndex: effect.tableIndex,
		position: 0,
		counter: effect.delay || 1,
		delay: effect.delay || 1
	};
}

export function getEffectTableSlot(slots, channelIndex, effectType) {
	return slots?.[channelIndex]?.[effectType] ?? null;
}
