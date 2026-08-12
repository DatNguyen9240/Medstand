$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$jobs = @(
    @{
        SourcePattern = 'B*Can Linh*m*i ctl*y*.png'
        Target = 'images/product-catalog/approved/cat-b037-bao-can-linh.jpg'
    },
    @{
        SourcePattern = 'catalog Visamed Family-01.png'
        Target = 'images/product-catalog/approved/cat-d024-visamed-family.jpg'
    }
)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object MimeType -eq 'image/jpeg'
$qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
$results = @()

foreach ($job in $jobs) {
    $sourceMatches = @(Get-ChildItem -LiteralPath (Join-Path $root 'images/product-catalog') -File -Filter $job.SourcePattern)
    if ($sourceMatches.Count -ne 1) {
        throw "Source image is not unique for $($job.Target)."
    }
    $sourcePath = $sourceMatches[0].FullName
    $targetPath = Join-Path $root $job.Target
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null

    $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $scale = [Math]::Min(1.0, 1600.0 / [double]$sourceImage.Width)
        $width = [int][Math]::Round($sourceImage.Width * $scale)
        $height = [int][Math]::Round($sourceImage.Height * $scale)
        $bitmap = [System.Drawing.Bitmap]::new($width, $height)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
            }
            finally {
                $graphics.Dispose()
            }

            $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
            try {
                $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $qualityEncoder, 88L
                $bitmap.Save($targetPath, $jpegCodec, $encoderParameters)
            }
            finally {
                $encoderParameters.Dispose()
            }
        }
        finally {
            $bitmap.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }

    $output = Get-Item -LiteralPath $targetPath
    if ($output.Length -gt 2097152) {
        throw "$($job.Target) is still larger than 2 MB."
    }
    $results += [pscustomobject]@{
        imagePath = $job.Target
        fileSizeBytes = $output.Length
        sha256 = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$results | ConvertTo-Json
