@echo off
rem One-shot exporter run for Windows Task Scheduler. Mode comes from config.json
rem ("shadow" by default); extra arguments (e.g. --dry-run, --shadow) are passed through.
rem Exit codes: 0 ok, 10 skipped (lock), 20 config, 30 snapshot, 40 source, 50 preflight, 60 publish, 70 internal.
setlocal
cd /d "%~dp0"
py -3 -m grins_pro_exporter --config "%~dp0config.json" run %*
exit /b %ERRORLEVEL%
