const factories = new Map();

export function registerAudioSlotKind(kind, factory) {
	if (typeof kind !== 'string' || !kind) {
		throw new Error('registerAudioSlotKind: kind must be a non-empty string');
	}
	if (typeof factory !== 'function') {
		throw new Error('registerAudioSlotKind: factory must be a function');
	}
	factories.set(kind, factory);
}

export function createAudioSlot(kind, port, chipIndex, sharedTimeline, initMessage) {
	const factory = factories.get(kind);
	if (!factory) {
		console.error(`Unknown audio slot kind: "${kind}"`);
		return null;
	}
	return factory(port, chipIndex, sharedTimeline, initMessage);
}
