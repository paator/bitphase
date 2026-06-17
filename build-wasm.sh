#!/bin/bash

# Source Emscripten environment if EMSDK is set
if [ -n "$EMSDK" ]; then
    source "$EMSDK/emsdk_env.sh"
fi

if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please install Emscripten first."
    exit 1
fi

EMCC_ARGS="\
    -O3 \
    -DNDEBUG \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=16777216 \
    -s MAXIMUM_MEMORY=16777216 \
    -s ENVIRONMENT='web' \
    -s STANDALONE_WASM=1 \
    --no-entry \
	"

emcc ${EMCC_ARGS} \
	external/ayumi/ayumi.c \
    -o public/ay/ayumi.wasm \
    -s EXPORTED_FUNCTIONS='["_ayumi_configure", "_ayumi_set_pan", "_ayumi_set_tone", "_ayumi_set_noise", "_ayumi_set_mixer", "_ayumi_set_volume", "_ayumi_set_timer_effect", "_ayumi_set_timer_effect_slot", "_ayumi_set_timer_effect_waveform", "_ayumi_timer_effect_reset", "_ayumi_get_timer_effect_active_period", "_ayumi_get_registers", "_ayumi_struct_size", "_ayumi_set_envelope", "_ayumi_set_envelope_shape", "_ayumi_process", "_ayumi_remove_dc", "_malloc", "_free"]'

emcc ${EMCC_ARGS} \
	external/nsfplug/nes_apu.c external/nsfplug/nes_dmc.c external/nsfplug/wasm-stdlib-shim.c \
    -o public/nes/nes_apu.wasm \
    -s EXPORTED_FUNCTIONS='["_nes_apu_Init", "_nes_apu_Reset", "_nes_apu_Tick", "_nes_apu_Render", "_nes_apu_Write", "_nes_apu_SetMask", "_nes_apu_SetStereoMix", "_nes_dmc_Init", "_nes_dmc_Reset", "_nes_dmc_Tick", "_nes_dmc_Render", "_nes_dmc_Write", "_nes_dmc_SetMask", "_nes_dmc_SetStereoMix", "_nes_dmc_SetPal", "_nes_dmc_SetAPU", "_nes_dmc_SetMemory_Read", "_nes_dmc_TickFrameSequence", "_malloc", "_free"]'

emcc ${EMCC_ARGS} \
	external/nsfplug/nes_mmc5.c \
    -o public/nes/nes_mmc5.wasm \
    -s EXPORTED_FUNCTIONS='["_nes_mmc5_Init", "_nes_mmc5_Reset", "_nes_mmc5_Tick", "_nes_mmc5_Render", "_nes_mmc5_Write", "_nes_mmc5_SetMask", "_nes_mmc5_SetStereoMix", "_nes_mmc5_TickFrameSequence"]'
