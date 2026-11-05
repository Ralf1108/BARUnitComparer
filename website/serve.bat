@echo off
rem Starts the local web server for the website and opens it in the browser (website/serve.py). Ctrl+C ends the server.
python "%~dp0serve.py" %*
pause
