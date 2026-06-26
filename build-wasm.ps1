if ($env:EMSDK) {
    $envScript = Join-Path $env:EMSDK "emsdk_env.ps1"
    if (Test-Path $envScript) { & $envScript }
}

$emccArgs = "-O3", "-DNDEBUG",
    "-s", "WASM=1",
    "-s", "ALLOW_MEMORY_GROWTH=1", "-s", "INITIAL_MEMORY=16777216", "-s", "MAXIMUM_MEMORY=16777216",
    "-s", "ENVIRONMENT=web", "-s", "STANDALONE_WASM=1", "--no-entry"

$ayumiArgs = "external/ayumi/ayumi.c", "-o", "public/ay/ayumi.wasm",
    "-s", "EXPORTED_FUNCTIONS=`"[\`"_ayumi_configure\`", \`"_ayumi_set_pan\`", \`"_ayumi_set_tone\`", \`"_ayumi_set_noise\`", \`"_ayumi_set_mixer\`", \`"_ayumi_set_volume\`", \`"_ayumi_set_timer_effect\`", \`"_ayumi_set_timer_effect_slot\`", \`"_ayumi_set_timer_effect_waveform\`", \`"_ayumi_timer_effect_reset\`", \`"_ayumi_get_timer_effect_active_period\`", \`"_ayumi_get_registers\`", \`"_ayumi_struct_size\`", \`"_ayumi_set_envelope\`", \`"_ayumi_set_envelope_shape\`", \`"_ayumi_process\`", \`"_ayumi_remove_dc\`", \`"_malloc\`", \`"_free\`"]`""

$nesApuArgs = "external/nsfplug/nes_apu.c", "external/nsfplug/nes_dmc.c", "-o", "public/nes/nes_apu.wasm",
    "-s", "EXPORTED_FUNCTIONS=`"[\`"_nes_apu_Init\`", \`"_nes_apu_Reset\`", \`"_nes_apu_Tick\`", \`"_nes_apu_Render\`", \`"_nes_apu_Write\`", \`"_nes_apu_SetMask\`", \`"_nes_apu_SetStereoMix\`", \`"_nes_apu_GetOut\`", \`"_nes_dmc_Init\`", \`"_nes_dmc_Reset\`", \`"_nes_dmc_Tick\`", \`"_nes_dmc_Render\`", \`"_nes_dmc_Write\`", \`"_nes_dmc_SetMask\`", \`"_nes_dmc_SetStereoMix\`", \`"_nes_dmc_SetPal\`", \`"_nes_dmc_SetAPU\`", \`"_nes_dmc_SetMemory_Read\`", \`"_nes_dmc_TickFrameSequence\`", \`"_nes_dmc_GetOut\`", \`"_malloc\`", \`"_free\`"]`""

$nesMmc5Args = "external/nsfplug/nes_mmc5.c", "-o", "public/nes/nes_mmc5.wasm",
    "-s", "EXPORTED_FUNCTIONS=`"[\`"_nes_mmc5_Init\`", \`"_nes_mmc5_Reset\`", \`"_nes_mmc5_Tick\`", \`"_nes_mmc5_Render\`", \`"_nes_mmc5_Write\`", \`"_nes_mmc5_SetMask\`", \`"_nes_mmc5_SetStereoMix\`", \`"_nes_mmc5_TickFrameSequence\`"]`""

$python = $null
foreach ($name in @('python', 'python3')) {
    $c = Get-Command $name -EA SilentlyContinue
    if ($c) { $python = $c.Source; break }
}
if (-not $python) {
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python*\python.exe",
        "$env:ProgramFiles\Python*\python.exe",
        "${env:ProgramFiles(x86)}\Python*\python.exe"
    )
    foreach ($p in $paths) {
        $f = Get-ChildItem $p -EA SilentlyContinue | Select-Object -First 1
        if ($f) { $python = $f.FullName; break }
    }
}

if (-not $env:EMSDK) {
    $try = @("$env:USERPROFILE\emsdk", "${env:ProgramFiles}\emsdk", "C:\emsdk")
    foreach ($d in $try) {
        $py = Join-Path $d "upstream\emscripten\emcc.py"
        if (Test-Path $py) {
            $env:EMSDK = $d
            $envScript = Join-Path $d "emsdk_env.ps1"
            if (Test-Path $envScript) { & $envScript }
            break
        }
    }
}
if (-not $env:EMSDK) {
    Write-Host "Error: EMSDK not set. Set EMSDK to your Emscripten install path (e.g. $env:USERPROFILE\emsdk)." -ForegroundColor Red
    exit 1
}

$emccPy = Join-Path $env:EMSDK "upstream\emscripten\emcc.py"
if (-not (Test-Path $emccPy)) {
    Write-Host "Error: emcc.py not found at $emccPy" -ForegroundColor Red
    exit 1
}

if (-not $python) {
    Write-Host "Error: Python not found. Add Python to PATH or install from https://www.python.org/" -ForegroundColor Red
    exit 1
}

& $python $emccPy @emccArgs @ayumiArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $python $emccPy @emccArgs @nesApuArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $python $emccPy @emccArgs @nesMmc5Args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
