class EffectAlgorithms {
	static ARPEGGIO = 'A'.charCodeAt(0);
	static SLIDE_UP = 1;
	static SLIDE_DOWN = 2;
	static PORTAMENTO = 'P'.charCodeAt(0);
	static SAMPLE_POSITION = 4;
	static ORNAMENT_POSITION = 5;
	static VIBRATO = 'V'.charCodeAt(0);
	static ON_OFF = 6;
	static SPEED = 'S'.charCodeAt(0);
	static AUTO_ENVELOPE = 'E'.charCodeAt(0);
	static DETUNE = 'D'.charCodeAt(0);

	static isSlideGroupEffect(effectType) {
		return (
			effectType === EffectAlgorithms.SLIDE_UP ||
			effectType === EffectAlgorithms.SLIDE_DOWN ||
			effectType === EffectAlgorithms.PORTAMENTO
		);
	}

	static getEffectActivationResets(newEffectType) {
		if (
			newEffectType === EffectAlgorithms.SLIDE_UP ||
			newEffectType === EffectAlgorithms.SLIDE_DOWN
		) {
			return { portamento: true };
		}
		if (newEffectType === EffectAlgorithms.PORTAMENTO) {
			return { slide: true };
		}
		return {};
	}

	static initSlide(parameter, delay) {
		// VT2: if delay is 0 initial counter is 1, but delay stays 0 (effect applied only for first tick)
		const storedDelay = delay || 0;
		const initialCounter = storedDelay === 0 ? 1 : storedDelay;
		return {
			step: parameter,
			delay: storedDelay,
			counter: initialCounter,
			current: parameter
		};
	}

	static processSlideCounter(counter, delay, step, current) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				return {
					counter: delay,
					current: current + step
				};
			}
			return {
				counter: newCounter,
				current
			};
		}
		return { counter, current };
	}

	static initPortamento(currentValue, targetValue, parameter, delay) {
		const delta = targetValue - currentValue;
		let step = parameter;
		if (delta < 0) {
			step = -parameter;
		}

		const normalizedDelay = delay || 1;
		const effectiveDelay = normalizedDelay === 0 ? 1 : normalizedDelay;

		return {
			target: targetValue,
			delta,
			step,
			delay: effectiveDelay,
			counter: effectiveDelay,
			active: true,
			currentSliding: 0
		};
	}

	static processPortamentoCounter(
		counter,
		delay,
		step,
		currentSliding,
		delta,
		target,
		baseValue
	) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				if (
					(step >= 0 && currentSliding >= delta) ||
					(step < 0 && currentSliding <= delta)
				) {
					return {
						counter: 0,
						currentSliding: 0,
						baseValue: target,
						active: false
					};
				}
				return {
					counter: delay,
					currentSliding: currentSliding + step,
					baseValue,
					active: true
				};
			}
			return {
				counter: newCounter,
				currentSliding,
				baseValue,
				active: true
			};
		}
		return {
			counter,
			currentSliding,
			baseValue,
			active: true
		};
	}

	static parseOnOffParameter(parameter) {
		return {
			offDuration: parameter & 15,
			onDuration: parameter >> 4
		};
	}

	static initOnOff(parameter) {
		const { offDuration, onDuration } = EffectAlgorithms.parseOnOffParameter(parameter);
		return {
			onDuration,
			offDuration,
			counter: onDuration,
			enabled: true
		};
	}

	static processOnOffCounter(counter, onDuration, offDuration, enabled) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				const newEnabled = !enabled;
				return {
					counter: newEnabled ? onDuration : offDuration,
					enabled: newEnabled
				};
			}
			return {
				counter: newCounter,
				enabled
			};
		}
		return { counter, enabled };
	}

	static initArpeggio(parameter, delay) {
		const semitone1 = (parameter >> 4) & 15;
		const semitone2 = parameter & 15;
		const normalizedDelay = delay || 1;
		const effectiveDelay = normalizedDelay === 0 ? 1 : normalizedDelay;
		return {
			semitone1,
			semitone2,
			delay: effectiveDelay,
			counter: effectiveDelay,
			position: 0
		};
	}

	static processArpeggioCounter(counter, delay, position) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				const newPosition = (position + 1) % 3;
				return {
					counter: delay,
					position: newPosition
				};
			}
			return {
				counter: newCounter,
				position
			};
		}
		return { counter, position };
	}

	static processArpeggioCounterTable(counter, delay, position, tableLength, tableLoop) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				let newPosition = 0;
				if (tableLength > 0) {
					newPosition = position + 1;
					if (newPosition >= tableLength) {
						newPosition = tableLoop >= 0 && tableLoop < tableLength ? tableLoop : 0;
					}
				}
				const nextCounter = delay > 0 ? delay : 1;
				return {
					counter: nextCounter,
					position: newPosition
				};
			}
			return { counter: newCounter, position };
		}
		return { counter, position };
	}

	static getArpeggioOffset(position, semitone1, semitone2) {
		if (position === 1) return semitone1;
		if (position === 2) return semitone2;
		return 0;
	}

	static parseVibratoParameter(parameter) {
		const rawSpeed = (parameter >> 4) & 15;
		return {
			speed: rawSpeed === 0 ? 1 : rawSpeed,
			depth: parameter & 15
		};
	}

	static initVibrato(parameter, delay) {
		const { speed, depth } = EffectAlgorithms.parseVibratoParameter(parameter);
		const normalizedDelay = delay || 0;
		const initialCounter = normalizedDelay === 0 ? 1 : normalizedDelay;
		return {
			speed,
			depth,
			delay: normalizedDelay,
			counter: initialCounter,
			position: 0
		};
	}

	static getPortamentoStepSign(delta, currentSliding) {
		return delta - currentSliding < 0 ? -1 : 1;
	}

	static processVibratoCounter(counter, delay, speed, position) {
		if (counter > 0) {
			const newCounter = counter - 1;
			if (newCounter === 0) {
				const newPosition = (position + 1) % (speed * 4);
				return {
					counter: delay === 0 ? 1 : delay,
					position: newPosition
				};
			}
			return {
				counter: newCounter,
				position
			};
		}
		return { counter, position };
	}

	static getVibratoOffset(position, speed, depth) {
		if (depth === 0) return 0;
		const cycle = speed * 4;
		const phase = position % cycle;
		const quarterCycle = speed;
		const halfCycle = speed * 2;
		const threeQuarterCycle = speed * 3;

		if (phase < quarterCycle) {
			return Math.floor((phase / quarterCycle) * depth);
		} else if (phase < halfCycle) {
			return depth - Math.floor(((phase - quarterCycle) / quarterCycle) * depth);
		} else if (phase < threeQuarterCycle) {
			return -Math.floor(((phase - halfCycle) / quarterCycle) * depth);
		} else {
			return -depth + Math.floor(((phase - threeQuarterCycle) / quarterCycle) * depth);
		}
	}
}

export default EffectAlgorithms;
