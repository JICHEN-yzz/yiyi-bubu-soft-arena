Add-Type -AssemblyName System.Speech

$voiceOutput = Join-Path $PSScriptRoot "..\assets\voices"
New-Item -ItemType Directory -Force -Path $voiceOutput | Out-Null
function Make-Text([int[]]$Codes) {
  return -join ($Codes | ForEach-Object { [char]$_ })
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }
$female = $voices | Where-Object { $_ -match "Huihui|Xiaoxiao|Yaoyao|Hanhan|Tracy" } | Select-Object -First 1
$male = $voices | Where-Object { $_ -match "Kangkang|Yunxi|Danny|David|Mark" } | Select-Object -First 1
if (-not $female) { $female = $voices | Select-Object -First 1 }
if (-not $male) { $male = $female }

$clips = @(
  @{ Voice = $female; Rate = 3; File = "yiyi_attack.wav"; Text = (Make-Text @(0x554A,0x6253)) },
  @{ Voice = $female; Rate = 1; File = "yiyi_heavy.wav"; Text = (Make-Text @(0x770B,0x62F3)) },
  @{ Voice = $female; Rate = 0; File = "yiyi_hurt.wav"; Text = (Make-Text @(0x54CE,0x5440)) },
  @{ Voice = $female; Rate = -1; File = "yiyi_super.wav"; Text = (Make-Text @(0x68C9,0x82B1,0x7CD6,0x98CE,0x66B4)) },
  @{ Voice = $male; Rate = 0; File = "bubu_attack.wav"; Text = (Make-Text @(0x563F,0x54C8)) },
  @{ Voice = $male; Rate = -2; File = "bubu_heavy.wav"; Text = (Make-Text @(0x62B1,0x62B1)) },
  @{ Voice = $male; Rate = -3; File = "bubu_hurt.wav"; Text = (Make-Text @(0x545C,0x554A)) },
  @{ Voice = $male; Rate = -4; File = "bubu_super.wav"; Text = (Make-Text @(0x8D85,0x7EA7,0x62B1,0x62B1)) }
)

foreach ($clip in $clips) {
  $synth.SelectVoice($clip.Voice)
  $synth.Rate = $clip.Rate
  $synth.Volume = 100
  $synth.SetOutputToWaveFile((Join-Path $voiceOutput $clip.File))
  $synth.Speak($clip.Text)
}
$synth.Dispose()
Write-Output "Generated voice clips with $female and $male"
