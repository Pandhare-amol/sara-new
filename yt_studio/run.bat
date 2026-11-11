@echo off
title Sara AI Autonomous Video Studio
cd /d "%~dp0"
echo Activating Virtual Environment...
call .venv\Scripts\activate.bat
echo Starting Video Studio...
python main.py
pause
