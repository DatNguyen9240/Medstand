@echo off
setlocal
set "ROOT=%~dp0"
set "DOC_DIR=%ROOT%docs\manual"
cd /d "%DOC_DIR%"

set "MAIN=huong_dan_medstand"

if not exist "%MAIN%.tex" (
  echo File %MAIN%.tex not found.
  exit /b 1
)

echo Cleaning auxiliary files...
for %%F in (aux bbl bcf blg fdb_latexmk fls idx ilg ind lof log lot out toc synctex.gz) do (
  if exist "%MAIN%.%%F" del /q "%MAIN%.%%F"
  if exist "*.%%F" del /q "*.%%F"
)

echo Building with xelatex (2 passes)...
xelatex -interaction=nonstopmode -halt-on-error -file-line-error "%MAIN%.tex"
if errorlevel 1 (
  echo First xelatex pass failed.
  exit /b 1
)

xelatex -interaction=nonstopmode -halt-on-error -file-line-error "%MAIN%.tex"
if errorlevel 1 (
  echo Second xelatex pass failed.
  exit /b 1
)

echo Build completed successfully.
echo Output: %DOC_DIR%\%MAIN%.pdf
endlocal
