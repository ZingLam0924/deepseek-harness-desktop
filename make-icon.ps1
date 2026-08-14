Add-Type -AssemblyName System.Drawing

$outDir = 'D:\projects\d-teacher-desktop\build'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$bmp = [System.Drawing.Bitmap]::new(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$outerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 30, 80, 130))
$g.FillEllipse($outerBrush, 8, 8, 240, 240)
$outerBrush.Dispose()

$innerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 60, 120, 175))
$g.FillEllipse($innerBrush, 28, 28, 200, 200)
$innerBrush.Dispose()

$font = [System.Drawing.Font]::new('Georgia', 96, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$sf = [System.Drawing.StringFormat]::new()
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = [System.Drawing.RectangleF]::new(0, 4, 256, 256)
$g.DrawString('D', $font, $white, $rect, $sf)
$white.Dispose()
$font.Dispose()
$sf.Dispose()
$g.Dispose()

$bmp.Save("$outDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "icon written: $(Test-Path "$outDir\icon.png")"
