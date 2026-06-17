import EffectAlgorithms from './effect-algorithms.js';

class TrackerPatternProcessor {
	constructor(state, chipAudioDriver, port) {
		this.state = state;
		this.chipAudioDriver = chipAudioDriver;
		this.port = port;
	}

	_applyPlaybackSpeed(speed) {
		if (!(speed > 0)) return;
		this.state.publishPlaybackSpeed(speed);
	}

	parsePatternRow(pattern, rowIndex, registerState) {
		if (!pattern || rowIndex >= pattern.length || rowIndex < 0) return;

		const patternRow = pattern.patternRows[rowIndex];
		if (!patternRow) return;

		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const channel = pattern.channels[channelIndex];
			const row = channel.rows[rowIndex];

			this._processNote(channelIndex, row);
			this._processTable(channelIndex, row);
			this._processVolume(channelIndex, row);
			this._processEffects(channelIndex, row, true);
		}

		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const channel = pattern.channels[channelIndex];
			const row = channel.rows[rowIndex];
			this._processSpeedOnly(channelIndex, row);
		}

		this.chipAudioDriver.processPatternRow(
			this.state,
			pattern,
			rowIndex,
			patternRow,
			registerState
		);
	}

	processTables() {
		for (let channelIndex = 0; channelIndex < this.state.channelTables.length; channelIndex++) {
			const tableIndex = this.state.channelTables[channelIndex];
			const baseNote = this.state.channelBaseNotes[channelIndex];

			if (tableIndex < 0) {
				this.state.channelCurrentNotes[channelIndex] = baseNote;
				continue;
			}

			const onOffHalted =
				this.state.channelOnOffCounter[channelIndex] > 0 &&
				!this.state.channelSoundEnabled[channelIndex];
			if (onOffHalted) continue;

			const table = this.state.getTable(tableIndex);
			if (!table || !table.rows || table.rows.length === 0) {
				this.state.channelCurrentNotes[channelIndex] = baseNote;
				continue;
			}

			if (baseNote < 0 || baseNote >= this.state.currentTuningTable.length) {
				this.state.channelCurrentNotes[channelIndex] = baseNote;
				continue;
			}

			const tableOffset = table.rows[this.state.tablePositions[channelIndex]];
			let finalNote = baseNote + tableOffset;

			const maxNote = this.state.currentTuningTable.length - 1;
			if (finalNote < 0) finalNote = 0;
			if (finalNote > maxNote) finalNote = maxNote;

			this.state.channelCurrentNotes[channelIndex] = finalNote;

			this.state.tableCounters[channelIndex]++;
			if (this.state.tableCounters[channelIndex] >= 1) {
				this.state.tableCounters[channelIndex] = 0;
				this.state.tablePositions[channelIndex]++;

				if (this.state.tablePositions[channelIndex] >= table.rows.length) {
					if (table.loop > 0 && table.loop < table.rows.length) {
						this.state.tablePositions[channelIndex] = table.loop;
					} else {
						this.state.tablePositions[channelIndex] = 0;
					}
				}
			}
		}
	}

	_processNote(channelIndex, row) {
		const effects = row.effects || [];

		if (!this.state.channelSlideAlreadyApplied) {
			this.state.channelSlideAlreadyApplied = [];
		}

		if (row.note.name === 1) {
			this._resetAllChannelEffects(channelIndex);
			this.state.channelSoundEnabled[channelIndex] = false;
			this.state.channelBaseNotes[channelIndex] = 0;
			this.state.channelCurrentNotes[channelIndex] = 0;
		} else if (row.note.name !== 0) {
			this.state.channelSoundEnabled[channelIndex] = true;
			const noteValue = row.note.name - 2 + (row.note.octave - 1) * 12;

			this.state.channelPreviousNotes[channelIndex] =
				this.state.channelBaseNotes[channelIndex];

			this.state.channelBaseNotes[channelIndex] = noteValue;
			this.state.channelCurrentNotes[channelIndex] = noteValue;

			if (this.state.channelTables[channelIndex] >= 0) {
				this.state.tablePositions[channelIndex] = 0;
				this.state.tableCounters[channelIndex] = 0;
			}

			const hasPortamentoCommand = effects.some(
				(e) => e && e.effect === EffectAlgorithms.PORTAMENTO
			);
			const hasSlideCommand = effects.some(
				(e) => e && EffectAlgorithms.isSlideGroupEffect(e.effect)
			);

			this._resetChannelEffectsOnNewNote(channelIndex, effects);

			if (!hasPortamentoCommand) {
				this.state.channelToneSliding[channelIndex] = 0;
			}
			if (!hasSlideCommand) {
				this.state.channelSlideStep[channelIndex] = 0;
				this.state.channelSlideAlreadyApplied[channelIndex] = false;
			}
		}
	}

	_resetAllChannelEffects(channelIndex) {
		this.state.channelToneSliding[channelIndex] = 0;
		this.state.channelSlideStep[channelIndex] = 0;
		this.state.channelSlideAlreadyApplied[channelIndex] = false;
		this.state.channelPortamentoActive[channelIndex] = false;
		this.state.channelOnOffCounter[channelIndex] = 0;
		this.state.channelArpeggioCounter[channelIndex] = 0;
		this.state.channelVibratoCounter[channelIndex] = 0;
		if (this.state.channelVibratoSliding) {
			this.state.channelVibratoSliding[channelIndex] = 0;
		}
		this.state.channelEffectTables[channelIndex] = -1;
	}

	_resetChannelEffectsOnNewNote(channelIndex, effects) {
		const hasEffectOfType = (type) => effects.some((e) => e && e.effect === type);
		const hasEffectWithTable = effects.some(
			(e) => e && e.tableIndex !== undefined && e.tableIndex >= 0
		);
		const rowHasExplicitEffect = effects[0] != null && effects[0].effect !== 0;

		if (!hasEffectOfType(EffectAlgorithms.ARPEGGIO)) {
			this.state.channelArpeggioCounter[channelIndex] = 0;
		}
		if (!hasEffectOfType(EffectAlgorithms.VIBRATO)) {
			this.state.channelVibratoCounter[channelIndex] = 0;
		}
		if (!hasEffectOfType(EffectAlgorithms.ON_OFF)) {
			this.state.channelOnOffCounter[channelIndex] = 0;
		}

		if (!rowHasExplicitEffect) return;

		if (!hasEffectWithTable) {
			this.state.channelEffectTables[channelIndex] = -1;
		}
	}

	_processTable(channelIndex, row) {
		const TABLE_OFF = -1;

		if (row.table === TABLE_OFF) {
			this._disableTable(channelIndex);
		} else if (row.table > 0) {
			this._enableTable(channelIndex, row.table - 1);
		}
	}

	_disableTable(channelIndex) {
		this.state.channelTables[channelIndex] = -1;
		this.state.tablePositions[channelIndex] = 0;
		this.state.tableCounters[channelIndex] = 0;
	}

	_enableTable(channelIndex, tableIndex) {
		if (this.state.getTable(tableIndex)) {
			this.state.channelTables[channelIndex] = tableIndex;
			this.state.tablePositions[channelIndex] = 0;
			this.state.tableCounters[channelIndex] = 0;
		}
	}

	_processVolume(channelIndex, row) {
		if (row.volume > 0) {
			this.state.channelPatternVolumes[channelIndex] = row.volume;
		}
	}

	_processEffects(channelIndex, row, skipSpeed = false) {
		if (!row.effects[0]) return;

		const effect = row.effects[0];
		const hasTableIndex = effect.tableIndex !== undefined && effect.tableIndex >= 0;

		if (
			hasTableIndex &&
			effect.effect !== EffectAlgorithms.SPEED &&
			effect.effect !== EffectAlgorithms.SAMPLE_POSITION &&
			effect.effect !== EffectAlgorithms.ORNAMENT_POSITION
		) {
			this._initEffectTable(channelIndex, effect);
		}

		const resets = EffectAlgorithms.getEffectActivationResets(effect.effect);
		if (resets.portamento) {
			this.state.channelPortamentoActive[channelIndex] = false;
		}
		if (resets.slide) {
			this.state.channelSlideStep[channelIndex] = 0;
			this.state.channelSlideCount[channelIndex] = 0;
		}

		switch (effect.effect) {
			case EffectAlgorithms.ARPEGGIO:
				this._initChannelArpeggio(channelIndex, effect, hasTableIndex);
				break;
			case EffectAlgorithms.VIBRATO:
				this._initChannelVibrato(channelIndex, effect, hasTableIndex);
				break;
			case EffectAlgorithms.SPEED:
				if (!skipSpeed) this._initSpeed(effect, hasTableIndex);
				break;
			case EffectAlgorithms.SLIDE_UP:
				this._initChannelSlide(channelIndex, effect, hasTableIndex, 1);
				break;
			case EffectAlgorithms.SLIDE_DOWN:
				this._initChannelSlide(channelIndex, effect, hasTableIndex, -1);
				break;
			case EffectAlgorithms.PORTAMENTO:
				this._initChannelPortamento(channelIndex, row, effect, hasTableIndex);
				break;
			case EffectAlgorithms.ON_OFF:
				this._initChannelOnOff(channelIndex, effect, hasTableIndex);
				break;
			case EffectAlgorithms.DETUNE:
				this._initChannelDetune(channelIndex, effect, hasTableIndex);
				break;
			case EffectAlgorithms.SAMPLE_POSITION:
				this._initChannelSamplePosition(channelIndex, effect);
				break;
			case EffectAlgorithms.ORNAMENT_POSITION:
				this._initChannelOrnamentPosition(channelIndex, effect);
				break;
		}
	}

	_processSpeedOnly(channelIndex, row) {
		if (!row.effects || !row.effects[0]) return;
		const effect = row.effects[0];
		if (effect.effect !== EffectAlgorithms.SPEED) return;
		const hasTableIndex = effect.tableIndex !== undefined && effect.tableIndex >= 0;
		this._initSpeed(effect, hasTableIndex);
	}

	_initChannelArpeggio(channelIndex, effect, hasTableIndex) {
		if (hasTableIndex) {
			const arpeggioState = EffectAlgorithms.initArpeggio(0, effect.delay);
			this.state.channelArpeggioSemitone1[channelIndex] = 0;
			this.state.channelArpeggioSemitone2[channelIndex] = 0;
			this.state.channelArpeggioDelay[channelIndex] = arpeggioState.delay;
			this.state.channelArpeggioCounter[channelIndex] = arpeggioState.counter;
			this.state.channelArpeggioPosition[channelIndex] = arpeggioState.position;
		} else {
			const arpeggioState = EffectAlgorithms.initArpeggio(effect.parameter, effect.delay);
			this.state.channelArpeggioSemitone1[channelIndex] = arpeggioState.semitone1;
			this.state.channelArpeggioSemitone2[channelIndex] = arpeggioState.semitone2;
			this.state.channelArpeggioDelay[channelIndex] = arpeggioState.delay;
			this.state.channelArpeggioCounter[channelIndex] = arpeggioState.counter;
			this.state.channelArpeggioPosition[channelIndex] = arpeggioState.position;
		}
	}

	_initChannelVibrato(channelIndex, effect, hasTableIndex) {
		const param = hasTableIndex ? this._getEffectTableValue(channelIndex) : effect.parameter;
		const vibratoState = EffectAlgorithms.initVibrato(param, effect.delay);
		this.state.channelVibratoSpeed[channelIndex] = vibratoState.speed;
		this.state.channelVibratoDepth[channelIndex] = vibratoState.depth;
		this.state.channelVibratoDelay[channelIndex] = vibratoState.delay;
		this.state.channelVibratoCounter[channelIndex] = vibratoState.counter;
		this.state.channelVibratoPosition[channelIndex] = vibratoState.position;
	}

	_initSpeed(effect, hasTableIndex) {
		if (hasTableIndex) {
			this.state.speedTable = effect.tableIndex;
			this.state.speedTablePosition = 0;
			const firstSpeed = this._getFirstNonZeroSpeedTableValue();
			this._applyPlaybackSpeed(firstSpeed);
		} else {
			this.state.speedTable = -1;
			if (effect.parameter > 0) {
				this._applyPlaybackSpeed(effect.parameter);
			}
		}
	}

	_initChannelSlide(channelIndex, effect, hasTableIndex, direction) {
		const param = hasTableIndex ? this._getEffectTableValue(channelIndex) : effect.parameter;
		const slideState = EffectAlgorithms.initSlide(direction * param, effect.delay);
		this.state.channelSlideStep[channelIndex] = slideState.step;
		this.state.channelSlideDelay[channelIndex] = slideState.delay;
		this.state.channelSlideCount[channelIndex] = slideState.counter;
	}

	_initChannelPortamento(channelIndex, row, effect, hasTableIndex) {
		if (row.note.name === 0 || row.note.name === 1) return;

		const currentNote = this.state.channelBaseNotes[channelIndex];
		const previousNote = this.state.channelPreviousNotes[channelIndex];

		const hasValidPrevious =
			previousNote >= 0 &&
			previousNote < this.state.currentTuningTable.length &&
			currentNote >= 0 &&
			currentNote < this.state.currentTuningTable.length;
		const isPortamentoFromNothing = previousNote === 0 && currentNote !== 0;

		if (!hasValidPrevious || isPortamentoFromNothing) return;

		const previousTone = this.state.currentTuningTable[previousNote];
		const currentTone = this.state.currentTuningTable[currentNote];
		const delta = currentTone - previousTone;

		const currentSliding = this.state.channelToneSliding
			? this.state.channelToneSliding[channelIndex]
			: 0;

		this.state.channelPortamentoTarget[channelIndex] = currentNote;
		this.state.channelPortamentoDelta[channelIndex] = delta;
		this.state.channelPortamentoActive[channelIndex] = true;

		this.state.channelBaseNotes[channelIndex] = previousNote;
		this.state.channelCurrentNotes[channelIndex] = previousNote;

		const param = hasTableIndex ? this._getEffectTableValue(channelIndex) : effect.parameter;
		this.state.channelSlideStep[channelIndex] = param;
		if (delta - currentSliding < 0) {
			this.state.channelSlideStep[channelIndex] = -param;
		}

		if (this.state.channelToneSliding) {
			this.state.channelToneSliding[channelIndex] = currentSliding;
		}

		let delay = effect.delay || 1;
		if (delay === 0) delay = 1;
		this.state.channelPortamentoDelay[channelIndex] = delay;
		this.state.channelPortamentoCount[channelIndex] = delay;
	}

	_initChannelOnOff(channelIndex, effect, hasTableIndex) {
		const param = hasTableIndex ? this._getEffectTableValue(channelIndex) : effect.parameter;
		const onOffState = EffectAlgorithms.initOnOff(param);
		this.state.channelOffDuration[channelIndex] = onOffState.offDuration;
		this.state.channelOnDuration[channelIndex] = onOffState.onDuration;
		this.state.channelOnOffCounter[channelIndex] = onOffState.counter;
	}

	_initChannelDetune(channelIndex, effect, hasTableIndex) {
		const param = hasTableIndex ? this._getEffectTableValue(channelIndex) : effect.parameter;
		this.state.channelDetune[channelIndex] = (param & 0xff) - 0x80;
	}

	_initChannelSamplePosition(channelIndex, effect) {
		if (this.state.instrumentPositions) {
			this.state.instrumentPositions[channelIndex] = effect.parameter & 0xff;
		}
	}

	_initChannelOrnamentPosition(channelIndex, effect) {
		this.state.tablePositions[channelIndex] = effect.parameter & 0xff;
	}

	_initEffectTable(channelIndex, effect) {
		this.state.channelEffectTables[channelIndex] = effect.tableIndex;
		this.state.channelEffectTablePositions[channelIndex] = 0;
		this.state.channelEffectTableCounters[channelIndex] = effect.delay || 1;
		this.state.channelEffectTableDelays[channelIndex] = effect.delay || 1;
		this.state.channelEffectTypes[channelIndex] = effect.effect;
	}

	_getEffectTableValue(channelIndex) {
		const tableIndex = this.state.channelEffectTables[channelIndex];
		if (tableIndex < 0) return 0;

		const table = this.state.getTable(tableIndex);
		if (!table || !table.rows || table.rows.length === 0) return 0;

		const position = this.state.channelEffectTablePositions[channelIndex];
		return table.rows[position] || 0;
	}

	_getSpeedTableValue() {
		const tableIndex = this.state.speedTable;
		if (tableIndex < 0) return 0;

		const table = this.state.getTable(tableIndex);
		if (!table || !table.rows || table.rows.length === 0) return 0;

		const position = this.state.speedTablePosition;
		return table.rows[position] || 0;
	}

	_getFirstNonZeroSpeedTableValue() {
		const tableIndex = this.state.speedTable;
		if (tableIndex < 0) return 0;

		const table = this.state.getTable(tableIndex);
		if (!table || !table.rows || table.rows.length === 0) return 0;

		let position = 0;
		const rows = table.rows;
		while (position < rows.length && (rows[position] || 0) <= 0) {
			position++;
		}
		if (position >= rows.length) return 0;

		this.state.speedTablePosition = position;
		return rows[position] || 0;
	}

	_advanceSpeedTable() {
		const tableIndex = this.state.speedTable;
		if (tableIndex < 0) return;

		const table = this.state.getTable(tableIndex);
		if (!table || !table.rows || table.rows.length === 0) return;

		this.state.speedTablePosition++;
		if (this.state.speedTablePosition >= table.rows.length) {
			if (table.loop >= 0 && table.loop < table.rows.length) {
				this.state.speedTablePosition = table.loop;
			} else {
				this.state.speedTablePosition = 0;
			}
		}
	}

	processSpeedTable() {
		if (this.state.speedTable < 0) return;

		const newSpeed = this._getSpeedTableValue();
		this._applyPlaybackSpeed(newSpeed);
		this._advanceSpeedTable();
	}

	processEffectTables() {
		for (
			let channelIndex = 0;
			channelIndex < this.state.channelEffectTables.length;
			channelIndex++
		) {
			const tableIndex = this.state.channelEffectTables[channelIndex];
			if (tableIndex < 0) continue;
			if (this.state.channelEffectTypes[channelIndex] === EffectAlgorithms.ARPEGGIO) continue;

			const table = this.state.getTable(tableIndex);
			if (!table || !table.rows || table.rows.length === 0) continue;

			this.state.channelEffectTableCounters[channelIndex]--;
			if (this.state.channelEffectTableCounters[channelIndex] <= 0) {
				this.state.channelEffectTableCounters[channelIndex] =
					this.state.channelEffectTableDelays[channelIndex];
				this.state.channelEffectTablePositions[channelIndex]++;

				if (this.state.channelEffectTablePositions[channelIndex] >= table.rows.length) {
					if (table.loop >= 0 && table.loop < table.rows.length) {
						this.state.channelEffectTablePositions[channelIndex] = table.loop;
					} else {
						this.state.channelEffectTablePositions[channelIndex] = 0;
					}
				}

				this._applyEffectTableParameter(channelIndex);
			}
		}
	}

	_applyEffectTableParameter(channelIndex) {
		const effectType = this.state.channelEffectTypes[channelIndex];
		const param = this._getEffectTableValue(channelIndex);

		switch (effectType) {
			case EffectAlgorithms.VIBRATO: {
				const { speed, depth } = EffectAlgorithms.parseVibratoParameter(param);
				this.state.channelVibratoSpeed[channelIndex] = speed;
				this.state.channelVibratoDepth[channelIndex] = depth;
				break;
			}
			case EffectAlgorithms.SLIDE_UP:
				this.state.channelSlideStep[channelIndex] = param;
				break;
			case EffectAlgorithms.SLIDE_DOWN:
				this.state.channelSlideStep[channelIndex] = -param;
				break;
			case EffectAlgorithms.PORTAMENTO: {
				const delta = this.state.channelPortamentoDelta[channelIndex];
				const currentSliding = this.state.channelToneSliding[channelIndex];
				this.state.channelSlideStep[channelIndex] =
					param * EffectAlgorithms.getPortamentoStepSign(delta, currentSliding);
				break;
			}
			case EffectAlgorithms.ON_OFF: {
				const { offDuration, onDuration } = EffectAlgorithms.parseOnOffParameter(param);
				this.state.channelOffDuration[channelIndex] = offDuration;
				this.state.channelOnDuration[channelIndex] = onDuration;
				break;
			}
			case EffectAlgorithms.SPEED:
				this._applyPlaybackSpeed(param);
				break;
			case EffectAlgorithms.DETUNE:
				this.state.channelDetune[channelIndex] = (param & 0xff) - 0x80;
				break;
		}
	}

	processSlides() {
		for (
			let channelIndex = 0;
			channelIndex < this.state.channelSlideStep.length;
			channelIndex++
		) {
			const slideStep = this.state.channelSlideStep[channelIndex];
			if (slideStep !== 0) {
				if (this.state.channelPortamentoActive[channelIndex]) {
					if (this.state.channelPortamentoCount[channelIndex] > 0) {
						this.state.channelPortamentoCount[channelIndex]--;
						if (this.state.channelPortamentoCount[channelIndex] === 0) {
							this.state.channelPortamentoCount[channelIndex] =
								this.state.channelPortamentoDelay[channelIndex];
							this.state.channelToneSliding[channelIndex] += slideStep;

							const delta = this.state.channelPortamentoDelta[channelIndex];
							const currentSliding = this.state.channelToneSliding[channelIndex];

							if (
								(slideStep < 0 && currentSliding <= delta) ||
								(slideStep >= 0 && currentSliding >= delta)
							) {
								const targetNote = this.state.channelPortamentoTarget[channelIndex];
								this.state.channelBaseNotes[channelIndex] = targetNote;
								this.state.channelCurrentNotes[channelIndex] = targetNote;
								this.state.channelToneSliding[channelIndex] = 0;
								this.state.channelSlideStep[channelIndex] = 0;
								this.state.channelPortamentoActive[channelIndex] = false;
							}
						}
					}
				} else {
					if (this.state.channelSlideCount[channelIndex] > 0) {
						const result = EffectAlgorithms.processSlideCounter(
							this.state.channelSlideCount[channelIndex],
							this.state.channelSlideDelay[channelIndex],
							slideStep,
							this.state.channelToneSliding[channelIndex]
						);
						this.state.channelSlideCount[channelIndex] = result.counter;
						this.state.channelToneSliding[channelIndex] = result.current;
					}
				}
			}
		}
	}

	processArpeggio() {
		for (
			let channelIndex = 0;
			channelIndex < this.state.channelArpeggioCounter.length;
			channelIndex++
		) {
			if (this.state.channelArpeggioCounter[channelIndex] > 0) {
				const tableIndex = this.state.channelEffectTables[channelIndex];
				const isArpeggioTable =
					tableIndex >= 0 &&
					this.state.channelEffectTypes[channelIndex] === EffectAlgorithms.ARPEGGIO;

				let result;
				let semitoneOffset;

				if (isArpeggioTable) {
					const table = this.state.getTable(tableIndex);
					const rows = table?.rows ?? [];
					const tableLength = rows.length;
					const tableLoop =
						table?.loop != null && table.loop >= 0 && table.loop < tableLength
							? table.loop
							: -1;
					const pos = this.state.channelArpeggioPosition[channelIndex];

					result = EffectAlgorithms.processArpeggioCounterTable(
						this.state.channelArpeggioCounter[channelIndex],
						this.state.channelArpeggioDelay[channelIndex],
						pos,
						tableLength,
						tableLoop
					);
					semitoneOffset = tableLength > 0 ? (rows[pos] ?? 0) : 0;
				} else {
					const currentPosition = this.state.channelArpeggioPosition[channelIndex];
					result = EffectAlgorithms.processArpeggioCounter(
						this.state.channelArpeggioCounter[channelIndex],
						this.state.channelArpeggioDelay[channelIndex],
						currentPosition
					);
					semitoneOffset = EffectAlgorithms.getArpeggioOffset(
						currentPosition,
						this.state.channelArpeggioSemitone1[channelIndex],
						this.state.channelArpeggioSemitone2[channelIndex]
					);
				}

				this.state.channelArpeggioCounter[channelIndex] = result.counter;
				this.state.channelArpeggioPosition[channelIndex] = result.position;

				const baseNote = this.state.channelBaseNotes[channelIndex];
				const arpeggioNote = baseNote + semitoneOffset;

				const maxNote = this.state.currentTuningTable.length - 1;
				let finalNote = arpeggioNote;
				if (finalNote < 0) finalNote = 0;
				if (finalNote > maxNote) finalNote = maxNote;

				this.state.channelCurrentNotes[channelIndex] = finalNote;
			}
		}
	}

	processVibrato() {
		for (
			let channelIndex = 0;
			channelIndex < this.state.channelVibratoCounter.length;
			channelIndex++
		) {
			if (this.state.channelVibratoCounter[channelIndex] > 0) {
				const result = EffectAlgorithms.processVibratoCounter(
					this.state.channelVibratoCounter[channelIndex],
					this.state.channelVibratoDelay[channelIndex],
					this.state.channelVibratoSpeed[channelIndex],
					this.state.channelVibratoPosition[channelIndex]
				);
				this.state.channelVibratoCounter[channelIndex] = result.counter;
				this.state.channelVibratoPosition[channelIndex] = result.position;

				const offset = EffectAlgorithms.getVibratoOffset(
					result.position,
					this.state.channelVibratoSpeed[channelIndex],
					this.state.channelVibratoDepth[channelIndex]
				);

				if (!this.state.channelVibratoSliding) {
					this.state.channelVibratoSliding = Array(
						this.state.channelVibratoCounter.length
					).fill(0);
				}
				this.state.channelVibratoSliding[channelIndex] = offset;
			}
		}
	}
}

export default TrackerPatternProcessor;
