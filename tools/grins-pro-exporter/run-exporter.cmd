@echo off
rem One-shot exporter run for Windows Task Scheduler. Mode comes from config.json
rem ("shadow" by default); extra arguments (e.g. --dry-run, --shadow) are passed through.
rem Exit codes: 0 ok, 10 skipped (lock), 20 config, 30 snapshot, 40 source, 50 preflight, 60 publish, 70 internal.
rem Python is called by absolute path (GrinS server: Python 3.13 for all users); set GRINS_PYTHON to override.
rem -E -s: ignore PYTHON* variables and the user site directory; -B: write no __pycache__ next to the code.
setlocal
cd /d "%~dp0"
if not defined GRINS_PYTHON set "GRINS_PYTHON=C:\Program Files\Python313\python.exe"
if not exist "%GRINS_PYTHON%" (
  echo Python not found: %GRINS_PYTHON% 1>&2
  exit /b 70
)
"%GRINS_PYTHON%" -E -s -B -m grins_pro_exporter --config "%~dp0config.json" run %*
exit /b %ERRORLEVEL%
