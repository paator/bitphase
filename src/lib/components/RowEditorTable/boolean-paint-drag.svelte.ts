export class BooleanPaintDrag {
	isDragging = $state(false);
	private dragValue = $state<boolean | null>(null);

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

	begin(getValue: () => boolean, apply: (value: boolean) => void): void {
		this.isDragging = true;
		this.dragValue = !getValue();
		apply(this.dragValue);
	}

	dragOver(apply: (value: boolean) => void): void {
		if (this.isDragging && this.dragValue !== null) {
			apply(this.dragValue);
		}
	}
}
