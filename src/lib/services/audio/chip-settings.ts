export class ChipSettings {
	private settings: Map<string, unknown> = new Map();
	private subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

	set(key: string, value: unknown): void {
		const oldValue = this.settings.get(key);
		if (oldValue === value) return;

		this.settings.set(key, value);
		this.notify(key, value);
	}

	get(key: string): unknown {
		return this.settings.get(key);
	}

	subscribe(key: string, callback: (value: unknown) => void): () => void {
		if (!this.subscribers.has(key)) {
			this.subscribers.set(key, new Set());
		}
		this.subscribers.get(key)!.add(callback);

		const currentValue = this.settings.get(key);
		if (currentValue !== undefined) {
			callback(currentValue);
		}

		return () => {
			this.subscribers.get(key)?.delete(callback);
		};
	}

	private notify(key: string, value: unknown): void {
		const callbacks = this.subscribers.get(key);
		if (callbacks) {
			callbacks.forEach((callback) => callback(value));
		}
	}

	setMultiple(settings: Record<string, unknown>): void {
		Object.entries(settings).forEach(([key, value]) => {
			this.set(key, value);
		});
	}

	renotifyAll(): void {
		for (const [key, value] of this.settings) {
			this.notify(key, value);
		}
	}
}

export class ChipSettingsRegistry {
	private readonly stores = new Map<string, ChipSettings>();

	forChip(chipType: string): ChipSettings {
		let store = this.stores.get(chipType);
		if (!store) {
			store = new ChipSettings();
			this.stores.set(chipType, store);
		}
		return store;
	}
}
