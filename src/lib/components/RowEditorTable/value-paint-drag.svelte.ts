export class ValuePaintDrag<T> {
	isDragging = $state(false);
	private dragValue = $state<T | null>(null);

	constructor() {
		$effect(() => {
			const stop = () => {
				this.isDragging = false;
				this.dragValue = null;
			};
			window.addEventListener('mouseup', stop);
			return () => window.removeEventListener('mouseup', stop);
		});
	}

	begin(value: T, apply: (value: T) => void): void {
		this.isDragging = true;
		this.dragValue = value;
		apply(value);
	}

	dragOver(apply: (value: T) => void): void {
		if (this.isDragging && this.dragValue !== null) {
			apply(this.dragValue);
		}
	}

	dragOverWithValue(value: T, apply: (value: T) => void): void {
		if (this.isDragging) {
			this.dragValue = value;
			apply(value);
		}
	}
}
