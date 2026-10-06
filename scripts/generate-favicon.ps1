param(
  [string]$Source = "public\\brand\\my-accurate-rent-favicon-source.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Ensure-Dir([string]$Path) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
}

function Write-CroppedSquarePng {
  param(
    [Parameter(Mandatory=$true)][string]$InPath,
    [Parameter(Mandatory=$true)][string]$OutPath,
    [Parameter(Mandatory=$true)][int]$Size
  )

  Ensure-Dir $OutPath
  $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $InPath).Path)
  try {
    $minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $src.Height; $y++) {
      for ($x = 0; $x -lt $src.Width; $x++) {
        if ($src.GetPixel($x, $y).A -gt 0) {
          if ($x -lt $minX) { $minX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }
    if ($maxX -lt 0) { throw "Favicon source has no visible pixels: $InPath" }

    $cropW = $maxX - $minX + 1
    $cropH = $maxY - $minY + 1
    # The source has substantial transparent padding. Keep only a small safe
    # margin so the mark fills the favicon without touching the canvas edge.
    $margin = [Math]::Ceiling([Math]::Max($cropW, $cropH) * 0.03)
    $square = [Math]::Max($cropW, $cropH) + ($margin * 2)
    $canvas = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $scale = [Math]::Min($Size / $square, $Size / $square)
        $drawW = [Math]::Round($cropW * $scale)
        $drawH = [Math]::Round($cropH * $scale)
        $x = [Math]::Round(($Size - $drawW) / 2)
        $y = [Math]::Round(($Size - $drawH) / 2)
        $srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
        $destRect = New-Object System.Drawing.Rectangle $x, $y, $drawW, $drawH
        $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $canvas.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $g.Dispose() }
    } finally { $canvas.Dispose() }
  } finally { $src.Dispose() }
}

function Write-IcoFromPng {
  param([string]$InPath, [string]$OutPath)
  Ensure-Dir $OutPath
  $bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $InPath).Path)
  try {
    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    try {
      $stream = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
      try { $icon.Save($stream) } finally { $stream.Dispose() }
    } finally { $icon.Dispose() }
  } finally { $bmp.Dispose() }
}

$source = (Resolve-Path $Source).Path
$canonical = "public\\brand\\my-accurate-rent-favicon.png"
Write-CroppedSquarePng -InPath $source -OutPath $canonical -Size 1024
Write-CroppedSquarePng -InPath $source -OutPath "public\\icon.png" -Size 512
Write-CroppedSquarePng -InPath $source -OutPath "public\\apple-touch-icon.png" -Size 180
Write-CroppedSquarePng -InPath $source -OutPath "public\\favicon-32.png" -Size 32
Write-IcoFromPng -InPath "public\\favicon-32.png" -OutPath "public\\favicon.ico"

foreach ($size in @(48, 72, 96, 128, 192, 256, 512)) {
  Write-CroppedSquarePng -InPath $source -OutPath ("public\\icons\\icon-{0}.png" -f $size) -Size $size
}

Write-Host "Generated favicon assets from $Source"
