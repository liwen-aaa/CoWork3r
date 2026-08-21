@echo off
rem trio.bat - double-click entry: open the three-pane window (ARCH/DEV/TESTER vertical 0.3/0.35/0.35)
rem Requires Windows Terminal (wt). Bypasses PowerShell execution policy for this script only.
title WORK-FLOW TRIO
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trio.ps1" -Root "%CD%"
