# launch-trio.ps1 - three-pane layout via Windows Terminal (adaptive, titled, vertical 0.3/0.35/0.35)
# Run from a physical terminal: powershell -ExecutionPolicy Bypass -File launch\trio.ps1 -Root <project-root>
# Or double-click trio.bat (sibling).
#
# Migrated from the old repo (work-flow-paper archive: its launch scripts).
# The shape (adaptive WorkingArea, wt --title + --suppressApplicationTitle, >=3 WF_ROLE anti-dup)
# was already validated there; "building a custom window-positioning script" was explicitly rejected.
# Changes from the old copy:
#   - $Root is a parameter now (old copy hardcoded the old repo path)
#   - WF_MILESTONE_PREFIX removed (milestone ids come from the plan/messages only)
#   - --skill removed (role specs are injected via before_agent_start by 06-roles)
#   - anti-dup matches on $Root instead of the old project name

param([string]$Root = (Get-Location).Path)

# Anti-dup (2026-08-18): if a trio is already running, refuse to open another set of panes.
# Repeated runs stack extra tabs in the same wt window; the extra arch/dev/tester instances
# then race to consume the same inbox, and messages get eaten by a pane the user cannot see.
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match [regex]::Escape($Root) -and $_.CommandLine -match 'WF_ROLE=' })
if ($running.Count -ge 3) {
  Write-Host "A work-flow trio is already running ($($running.Count) role processes)."
  Write-Host "Close the old window first, or use /reload in the existing windows instead of re-running this script."
  exit 1
}

$arch   = "title ARCH && cd /d $Root && set WF_ROLE=arch&& pi"
$dev    = "title DEV && cd /d $Root && set WF_ROLE=dev&& pi"
$tester = "title TESTER && cd /d $Root && set WF_ROLE=tester&& pi"

# Single atomic wt command: one window, three VERTICAL panes with ratio 0.3 / 0.35 / 0.35
# --size = portion of the PARENT pane used to create the NEW pane.
#   nt ARCH (100%) -> sp -V --size 0.7 DEV  => arch 30%, dev 70%
#   -> sp -V --size 0.5 TESTER              => dev 35%, tester 35%
wt -w 0 nt --title ARCH --suppressApplicationTitle cmd /k "$arch" `; sp -V --size 0.7 --title DEV --suppressApplicationTitle cmd /k "$dev" `; sp -V --size 0.5 --title TESTER --suppressApplicationTitle cmd /k "$tester"

Write-Host "Three vertical panes opened: ARCH(0.3) / DEV(0.35) / TESTER(0.35) for $Root"
