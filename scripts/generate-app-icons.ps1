param(
  [string]$Source = "assets\\sorana-icon-source.png",
  [string]$Background = "#ffffff"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-Color([string]$hex) {
  $clean = $hex.Trim()
  if ($clean.StartsWith("#")) { $clean = $clean.Substring(1) }
  if ($clean.Length -ne 6) { throw "Background must be a 6-digit hex color like #ffffff" }
  $r = [Convert]::ToInt32($clean.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($clean.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($clean.Substring(4, 2), 16)
  return [System.Drawing.Color]::FromArgb(255, $r, $g, $b)
}

function Ensure-Dir([string]$path) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
}

function Write-PngSquareIcon {
  param(
    [Parameter(Mandatory=$true)][string]$InPath,
    [Parameter(Mandatory=$true)][string]$OutPath,
    [Parameter(Mandatory=$true)][int]$Size,
    [Parameter(Mandatory=$true)][double]$ContentScale,
    [Parameter(Mandatory=$true)][System.Drawing.Color]$Bg,
    [switch]$TransparentBackground
  )

  Ensure-Dir $OutPath

  $srcPath = (Resolve-Path $InPath).Path
  $src = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $canvas = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        if ($TransparentBackground) {
          $g.Clear([System.Drawing.Color]::Transparent)
        } else {
          $g.Clear($Bg)
        }
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver

        $maxW = [Math]::Floor($Size * $ContentScale)
        $maxH = [Math]::Floor($Size * $ContentScale)
        $scale = [Math]::Min($maxW / $src.Width, $maxH / $src.Height)
        $drawW = [Math]::Round($src.Width * $scale)
        $drawH = [Math]::Round($src.Height * $scale)

        $x = [Math]::Round(($Size - $drawW) / 2)
        $y = [Math]::Round(($Size - $drawH) / 2)

        $destRect = New-Object System.Drawing.Rectangle $x, $y, $drawW, $drawH
        $g.DrawImage($src, $destRect)

        $canvas.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $g.Dispose()
      }
    } finally {
      $canvas.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

function Write-IcoFromPngSquareIcon {
  param(
    [Parameter(Mandatory=$true)][string]$InPath,
    [Parameter(Mandatory=$true)][string]$OutPath,
    [Parameter(Mandatory=$true)][int]$Size,
    [Parameter(Mandatory=$true)][double]$ContentScale,
    [Parameter(Mandatory=$true)][System.Drawing.Color]$Bg
  )

  Ensure-Dir $OutPath

  $tmpPng = Join-Path $env:TEMP ("sorana-favicon-{0}.png" -f ([Guid]::NewGuid().ToString("N")))
  try {
    Write-PngSquareIcon -InPath $InPath -OutPath $tmpPng -Size $Size -ContentScale $ContentScale -Bg $Bg
    $bmp = [System.Drawing.Bitmap]::FromFile($tmpPng)
    try {
      $hIcon = $bmp.GetHicon()
      $ico = [System.Drawing.Icon]::FromHandle($hIcon)
      try {
        $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
        try {
          $ico.Save($fs)
        } finally {
          $fs.Dispose()
        }
      } finally {
        $ico.Dispose()
      }
    } finally {
      $bmp.Dispose()
    }
  } finally {
    if (Test-Path $tmpPng) { Remove-Item -Force $tmpPng }
  }
}

$bg = New-Color $Background
$launcherContentScale = 0.72
$androidRoundContentScale = 0.70
$androidAdaptiveContentScale = 0.64

if (-not (Test-Path $Source)) {
  throw "Icon source not found: $Source"
}

# Preserve the old full artwork source if present, and replace app-icon-source.png with the simplified icon source.
$fullSourceBackup = "assets\\app-icon-source-full.png"
if ((Test-Path "assets\\app-icon-source.png") -and -not (Test-Path $fullSourceBackup)) {
  Move-Item "assets\\app-icon-source.png" $fullSourceBackup
}

Write-PngSquareIcon -InPath $Source -OutPath "assets\\app-icon-source.png" -Size 512 -ContentScale $launcherContentScale -Bg $bg
Write-PngSquareIcon -InPath $Source -OutPath "assets\\icon.png" -Size 512 -ContentScale $launcherContentScale -Bg $bg

# Web/PWA
Write-PngSquareIcon -InPath $Source -OutPath "public\\icon.png" -Size 512 -ContentScale $launcherContentScale -Bg $bg
Write-PngSquareIcon -InPath $Source -OutPath "public\\apple-touch-icon.png" -Size 180 -ContentScale $launcherContentScale -Bg $bg
Write-IcoFromPngSquareIcon -InPath $Source -OutPath "public\\favicon.ico" -Size 32 -ContentScale 0.82 -Bg $bg

$pwaSizes = @(48, 72, 96, 128, 192, 256, 512)
foreach ($s in $pwaSizes) {
  Write-PngSquareIcon -InPath $Source -OutPath ("public\\icons\\icon-{0}.png" -f $s) -Size $s -ContentScale $launcherContentScale -Bg $bg
}

# iOS (marketing icon is 1024x1024)
Write-PngSquareIcon -InPath $Source -OutPath "ios\\App\\App\\Assets.xcassets\\AppIcon.appiconset\\AppIcon-512@2x.png" -Size 1024 -ContentScale $launcherContentScale -Bg $bg

# Android legacy launcher icons
$androidLegacy = @(
  @{ Dir = "mipmap-ldpi";  Size = 36  },
  @{ Dir = "mipmap-mdpi";  Size = 48  },
  @{ Dir = "mipmap-hdpi";  Size = 72  },
  @{ Dir = "mipmap-xhdpi"; Size = 96  },
  @{ Dir = "mipmap-xxhdpi"; Size = 144 },
  @{ Dir = "mipmap-xxxhdpi"; Size = 192 }
)

foreach ($entry in $androidLegacy) {
  $dir = $entry.Dir
  $size = [int]$entry.Size
  $base = "android\\app\\src\\main\\res\\$dir"
  Write-PngSquareIcon -InPath $Source -OutPath "$base\\ic_launcher.png" -Size $size -ContentScale $launcherContentScale -Bg $bg
  Write-PngSquareIcon -InPath $Source -OutPath "$base\\ic_launcher_round.png" -Size $size -ContentScale $androidRoundContentScale -Bg $bg
}

# Android adaptive foreground (keep content inside safe area)
$androidFg = @(
  @{ Dir = "mipmap-ldpi";  Size = 81  },
  @{ Dir = "mipmap-mdpi";  Size = 108 },
  @{ Dir = "mipmap-hdpi";  Size = 162 },
  @{ Dir = "mipmap-xhdpi"; Size = 216 },
  @{ Dir = "mipmap-xxhdpi"; Size = 324 },
  @{ Dir = "mipmap-xxxhdpi"; Size = 432 }
)

foreach ($entry in $androidFg) {
  $dir = $entry.Dir
  $size = [int]$entry.Size
  $base = "android\\app\\src\\main\\res\\$dir"
  Write-PngSquareIcon -InPath $Source -OutPath "$base\\ic_launcher_foreground.png" -Size $size -ContentScale $androidAdaptiveContentScale -Bg $bg -TransparentBackground
}

Write-Host "Done. Updated web, iOS, and Android icon assets from $Source"
