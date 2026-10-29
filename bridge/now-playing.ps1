# ---------------------------------------------------------------
# now-playing.ps1 - The "bridge" between Windows and spotifyclip
#
# Windows knows what music is playing (it is what shows the title
# and cover when you change the volume). Microsoft exposes this
# through an official API called "System Media Transport Controls".
#
# This script reads it every 400 ms and prints one JSON line per
# reading. The Vite server (bridge/plugin.js) reads those lines.
#
# Test it alone in a terminal:
#   powershell -ExecutionPolicy Bypass -File bridge\now-playing.ps1
#
# (This file is kept in plain ASCII on purpose: Windows PowerShell 5.1
#  can misread accented characters in script files.)
# ---------------------------------------------------------------

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

# Load the Windows Runtime types we need
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

# Windows APIs are asynchronous. This helper waits for the result.
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($operation, [Type]$resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $null = $task.Wait(-1)
    return $task.Result
}

function Send($message) {
    [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
}

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
                 ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# Prefer the Spotify app. Otherwise take whatever Windows considers "current"
# (a browser, Deezer, YouTube Music...).
function Get-MusicSession {
    $sessions = @($manager.GetSessions())
    $spotify = $sessions | Where-Object { $_.SourceAppUserModelId -match 'Spotify' } | Select-Object -First 1
    if ($spotify) { return $spotify }
    return $manager.GetCurrentSession()
}

# Read the album cover and return it as base64 text
function Read-Cover($thumbnail) {
    if (-not $thumbnail) { return $null }
    try {
        $stream = Await ($thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
        $memory = New-Object System.IO.MemoryStream
        $netStream.CopyTo($memory)
        $netStream.Dispose()
        if ($memory.Length -eq 0) { return $null }
        $type = $stream.ContentType
        if (-not $type) { $type = 'image/png' }
        return @{ type = $type; data = [Convert]::ToBase64String($memory.ToArray()) }
    } catch {
        return $null
    }
}

Send @{ type = 'ready' }

$lastKey = $null
$ticksSinceChange = 0

while ($true) {
    try {
        $session = Get-MusicSession
        $props = $null
        if ($session) {
            $props = Await ($session.TryGetMediaPropertiesAsync()) `
                           ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        }

        if (-not $props -or -not $props.Title) {
            $lastKey = $null
            Send @{ type = 'state'; track = $null }
        } else {
            $playing = "$($session.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing'

            # Position in the song. Windows gives the position at the time of
            # the last update, so we add the time elapsed since then.
            $timeline = $session.GetTimelineProperties()
            $durationMs = [int64]($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
            $positionMs = $null
            if ($durationMs -gt 0) {
                $position = $timeline.Position.TotalMilliseconds
                if ($playing -and $timeline.LastUpdatedTime.Year -gt 2000) {
                    $position += ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalMilliseconds
                }
                $positionMs = [int64][Math]::Min([Math]::Max($position, 0), $durationMs)
            }

            $key = "$($props.Artist)|$($props.Title)|$($props.AlbumTitle)"
            if ($key -ne $lastKey) { $lastKey = $key; $ticksSinceChange = 0 } else { $ticksSinceChange++ }

            $message = @{
                type  = 'state'
                track = @{
                    key        = $key
                    title      = $props.Title
                    artist     = $props.Artist
                    album      = $props.AlbumTitle
                    app        = $session.SourceAppUserModelId
                    isPlaying  = $playing
                    positionMs = $positionMs
                    durationMs = $durationMs
                }
            }

            # The cover is read right after a song change, then once more
            # 2 seconds later (some apps update the picture a bit late).
            if ($ticksSinceChange -eq 0 -or $ticksSinceChange -eq 5) {
                $cover = Read-Cover $props.Thumbnail
                if ($cover) { $message.cover = $cover }
            }

            Send $message
        }
    } catch {
        Send @{ type = 'error'; message = $_.Exception.Message }
    }
    Start-Sleep -Milliseconds 400
}
