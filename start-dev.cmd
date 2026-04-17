@echo off
setlocal

set "ROOT=%~dp0"

start "ApnaCare Backend" cmd /k "cd /d "%ROOT%backend" && python -m app.main"
start "ApnaCare Frontend" cmd /k "cd /d "%ROOT%frontend" && npm.cmd run dev"
