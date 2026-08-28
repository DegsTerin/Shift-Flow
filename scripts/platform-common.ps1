# en-GB: Provides side-effect-free ownership and state helpers so platform scripts act only on verified ShiftFlow processes.
Set-StrictMode -Version Latest

function Get-CanonicalPath {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  return [System.IO.Path]::GetFullPath($Path).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Test-PathWithinRoot {
  param(
    [Parameter(Mandatory)]
    [string]$Path,

    [Parameter(Mandatory)]
    [string]$RepositoryRoot
  )

  $candidate = Get-CanonicalPath -Path $Path
  $root = Get-CanonicalPath -Path $RepositoryRoot
  $rootBoundary = $root + [System.IO.Path]::DirectorySeparatorChar
  return $candidate.StartsWith($rootBoundary, [System.StringComparison]::OrdinalIgnoreCase)
}

function Enter-ExclusiveFileLock {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  try {
    return [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    throw "Another ShiftFlow platform operation already owns the lock at $Path."
  }
}

function Enter-PlatformOperationLock {
  param(
    [Parameter(Mandatory)]
    [string]$RepositoryRoot
  )

  $lockPath = Join-Path (Get-CanonicalPath -Path $RepositoryRoot) '.shiftflow/runtime/platform-operation.lock'
  $existingLock = Get-Variable -Name ShiftFlowPlatformOperationLockState -Scope Global -ErrorAction SilentlyContinue
  if ($existingLock) {
    if (-not ([string]$existingLock.Value.Path).Equals(
        $lockPath,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
      throw "This PowerShell process already owns a ShiftFlow platform lock for another repository."
    }

    return [pscustomobject]@{
      IsOwner = $false
      Path = $lockPath
      Stream = $existingLock.Value.Stream
    }
  }

  $lockDirectory = Split-Path -Parent $lockPath
  New-Item -ItemType Directory -Force -Path $lockDirectory | Out-Null
  $stream = Enter-ExclusiveFileLock -Path $lockPath
  $state = [pscustomobject]@{
    Path = $lockPath
    Stream = $stream
  }
  Set-Variable -Name ShiftFlowPlatformOperationLockState -Scope Global -Value $state

  return [pscustomobject]@{
    IsOwner = $true
    Path = $lockPath
    Stream = $stream
  }
}

function Exit-PlatformOperationLock {
  param(
    [Parameter(Mandatory)]
    [object]$Lease
  )

  if (-not $Lease.IsOwner) {
    return
  }

  try {
    $Lease.Stream.Dispose()
  } finally {
    Remove-Variable -Name ShiftFlowPlatformOperationLockState -Scope Global -ErrorAction SilentlyContinue
  }
}

function Assert-NoReparsePointsInTree {
  param(
    [Parameter(Mandatory)]
    [string]$Path,

    [Parameter(Mandatory)]
    [string]$RepositoryRoot
  )

  $candidate = Get-CanonicalPath -Path $Path
  $root = Get-CanonicalPath -Path $RepositoryRoot
  if (-not (Test-PathWithinRoot -Path $candidate -RepositoryRoot $root)) {
    throw "Refusing to inspect outside workspace: $candidate"
  }

  $rootItem = Get-Item -LiteralPath $root -Force -ErrorAction Stop
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing a destructive operation through a reparse point: $($rootItem.FullName)"
  }

  $relativePath = $candidate.Substring($root.Length).TrimStart(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $currentPath = $root
  foreach ($component in $relativePath.Split(
      @([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar),
      [System.StringSplitOptions]::RemoveEmptyEntries
    )) {
    $currentPath = Join-Path $currentPath $component
    $currentItem = Get-Item -LiteralPath $currentPath -Force -ErrorAction Stop
    if (($currentItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing a destructive operation through a reparse point: $($currentItem.FullName)"
    }
  }

  $target = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
  if (-not $target.PSIsContainer) {
    return
  }

  $pending = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
  $pending.Push([System.IO.DirectoryInfo]$target)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($child in $directory.GetFileSystemInfos()) {
      if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to remove a tree containing a reparse point: $($child.FullName)"
      }
      if (($child.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
        $pending.Push([System.IO.DirectoryInfo]$child)
      }
    }
  }
}

function Get-Sha256Text {
  param(
    [Parameter(Mandatory)]
    [string]$Value
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hash.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant()
  } finally {
    $hash.Dispose()
  }
}

function Get-EncodedCommandFromCommandLine {
  param(
    [AllowNull()]
    [string]$CommandLine
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $null
  }

  $match = [regex]::Match(
    $CommandLine,
    '(?i)(?:-EncodedCommand|-enc)\s+(?:"(?<value>[^"]+)"|(?<value>\S+))'
  )
  if (-not $match.Success) {
    return $null
  }

  return $match.Groups['value'].Value
}

function Get-ManagedProcessSnapshot {
  param(
    [Parameter(Mandatory)]
    [int]$ProcessId
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    return $null
  }

  $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  $startTimeUtc = try {
    $process.StartTime.ToUniversalTime().ToString('o')
  } catch {
    $null
  }

  return [pscustomobject]@{
    ProcessId = $process.Id
    Name = $process.ProcessName
    StartTimeUtc = $startTimeUtc
    CommandLine = if ($cimProcess) { $cimProcess.CommandLine } else { $null }
  }
}

function Test-ManagedProcessOwnership {
  param(
    [Parameter(Mandatory)]
    [object]$Entry,

    [Parameter(Mandatory)]
    [string]$RepositoryRoot,

    [AllowNull()]
    [object]$Snapshot
  )

  if (-not $Snapshot) {
    return $false
  }

  $requiredProperties = @('root', 'pid', 'processName', 'startTimeUtc', 'encodedCommandHash')
  if ($requiredProperties.Where({ $Entry.PSObject.Properties.Name -notcontains $_ }).Count -gt 0) {
    return $false
  }

  $expectedRoot = Get-CanonicalPath -Path $RepositoryRoot
  $entryRoot = Get-CanonicalPath -Path ([string]$Entry.root)
  if (-not $entryRoot -or
      -not $entryRoot.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  try {
    $entryStartTime = [DateTimeOffset]$Entry.startTimeUtc
    $snapshotStartTime = [DateTimeOffset]$Snapshot.StartTimeUtc
  } catch {
    return $false
  }

  if ([int]$Entry.pid -ne [int]$Snapshot.ProcessId -or
      [string]$Entry.processName -ne [string]$Snapshot.Name -or
      $entryStartTime.UtcTicks -ne $snapshotStartTime.UtcTicks) {
    return $false
  }

  $encodedCommand = Get-EncodedCommandFromCommandLine -CommandLine $Snapshot.CommandLine
  if (-not $encodedCommand) {
    return $false
  }

  return (Get-Sha256Text -Value $encodedCommand) -eq [string]$Entry.encodedCommandHash
}

function Stop-VerifiedProcessTree {
  param(
    [Parameter(Mandatory)]
    [int]$ProcessId
  )

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-VerifiedProcessTree -ProcessId $child.ProcessId
  }

  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
  }
}

function Get-ManagedProcessTreeIds {
  param(
    [Parameter(Mandatory)]
    [int]$ProcessId
  )

  $processIds = New-Object 'System.Collections.Generic.HashSet[int]'
  $pending = New-Object 'System.Collections.Generic.Queue[int]'
  [void]$processIds.Add($ProcessId)
  $pending.Enqueue($ProcessId)

  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
      $childId = [int]$child.ProcessId
      if ($processIds.Add($childId)) {
        $pending.Enqueue($childId)
      }
    }
  }

  return @($processIds)
}

function Test-ListenerOwnership {
  param(
    [Parameter(Mandatory)]
    [object[]]$Listeners,

    [Parameter(Mandatory)]
    [int[]]$AllowedProcessIds
  )

  if ($Listeners.Count -eq 0 -or $AllowedProcessIds.Count -eq 0) {
    return $false
  }

  foreach ($listener in $Listeners) {
    if ($AllowedProcessIds -notcontains [int]$listener.ProcessId) {
      return $false
    }
  }
  return $true
}

function Test-PortOwnedByManagedEntry {
  param(
    [Parameter(Mandatory)]
    [object]$Entry,

    [Parameter(Mandatory)]
    [string]$RepositoryRoot,

    [Parameter(Mandatory)]
    [int]$Port
  )

  $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$Entry.pid)
  if (-not (Test-ManagedProcessOwnership -Entry $Entry -RepositoryRoot $RepositoryRoot -Snapshot $snapshot)) {
    return $false
  }

  $listeners = Get-PortListeners -Ports @($Port)
  $processTreeIds = Get-ManagedProcessTreeIds -ProcessId ([int]$Entry.pid)
  return Test-ListenerOwnership -Listeners $listeners -AllowedProcessIds $processTreeIds
}

function Write-PlatformState {
  param(
    [Parameter(Mandatory)]
    [string]$Path,

    [Parameter(Mandatory)]
    [object]$State
  )

  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $temporaryPath = "$Path.$PID.$([guid]::NewGuid().ToString('N')).tmp"
  try {
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Get-PortListeners {
  param(
    [Parameter(Mandatory)]
    [int[]]$Ports
  )

  $listeners = foreach ($port in $Ports) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -gt 0 } |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object {
        $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
        [pscustomobject]@{
          Port = $port
          ProcessId = $_
          ProcessName = if ($process) { $process.ProcessName } else { 'unknown' }
        }
      }
  }

  return @($listeners)
}
