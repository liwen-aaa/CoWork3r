@echo off
rem trio.bat - double-click entry: open the three-pane window (ARCH/DEV/TESTER vertical 0.3/0.35/0.35)
rem Requires Windows Terminal (wt). Bypasses PowerShell execution policy for this script only.
title WORK-FLOW TRIO
rem Project root: prefer the parent of this script (works when launch/ sits in the project root,
rem e.g. this repo). Fall back to the current directory (works when the script lives inside
rem node_modules/.../launch/ and the user runs it from the project root).
if exist "%~dp0..\wf.config.json" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trio.ps1" -Root "%~dp0.."
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trio.ps1" -Root "%CD%"
)
