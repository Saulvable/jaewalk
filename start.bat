@echo off
cd /d D:\Util\jaewalk
start "" "http://localhost:5173"
start "JaeWalk PDF Server" /min python pdf_server.py
npm run dev
