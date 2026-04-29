@echo off
REM ============================================================
REM  Lorcana Picking Tool - Build script for Windows
REM ============================================================
REM  Compiles a standalone LorcanaPicking.exe.
REM  Double-click this file. The .exe lands in `dist\LorcanaPicking\`.
REM ============================================================

setlocal enableextensions enabledelayedexpansion

REM Move to the directory where this .bat lives, even if path has spaces.
cd /d "%~dp0"

echo.
echo ====================================================
echo   Lorcana Picking Tool - Build Windows EXE
echo ====================================================
echo.
echo Dossier de travail : %CD%
echo.

REM --- Sanity 1: are we in the right folder? -------------------
REM    Required files: app.py, requirements.txt, lorcana_picking.spec
if not exist "app.py" goto NOT_IN_PROJECT
if not exist "requirements.txt" goto NOT_IN_PROJECT
if not exist "lorcana_picking.spec" goto NOT_IN_PROJECT
if not exist "config.json" goto NOT_IN_PROJECT
goto FILES_OK

:NOT_IN_PROJECT
REM Maybe the user dropped this .bat one level above the actual project.
REM Try to descend into a `lorcana_picking` subfolder if it exists.
if exist "lorcana_picking\app.py" (
    echo [INFO] Detection : les fichiers du projet sont dans le sous-dossier
    echo        "lorcana_picking\". On y descend.
    cd /d "%~dp0lorcana_picking"
    echo Nouveau dossier de travail : %CD%
    echo.
    goto FILES_OK
)
echo [ERREUR] Ce script doit etre dans le meme dossier que app.py,
echo          requirements.txt, config.json et lorcana_picking.spec.
echo.
echo          Dossier actuel : %CD%
echo.
echo          Solution : place ce .bat dans le dossier qui contient les
echo          fichiers .py du projet (par exemple C:\LorcanaPicking\),
echo          puis relance-le.
echo.
pause
exit /b 1

:FILES_OK
echo [OK] Fichiers du projet trouves.
echo.

REM --- Sanity 2: Python in PATH? -------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Python n'est pas dans le PATH.
    echo         Installe-le depuis https://www.python.org/downloads/
    echo         et coche "Add Python to PATH" pendant l'installation.
    pause
    exit /b 1
)

echo [1/4] Verification de Python...
python --version
echo.

REM --- Step 2: install dependencies ----------------------------
echo [2/4] Installation des dependances + PyInstaller...
echo       (peut prendre quelques minutes au 1er lancement)
echo.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 goto PIP_FAIL
python -m pip install pyinstaller
if errorlevel 1 goto PIP_FAIL
echo.
goto AFTER_PIP

:PIP_FAIL
echo.
echo [ERREUR] Echec de l'installation d'une dependance.
echo.
echo Si tu vois "is not writeable", essaie de relancer ce .bat en
echo "Executer en tant qu'administrateur" (clic droit dessus).
echo.
pause
exit /b 1

:AFTER_PIP

REM --- Step 3: clean previous builds ---------------------------
echo [3/4] Nettoyage des builds precedents...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo.

REM --- Step 4: build! ------------------------------------------
echo [4/4] Compilation de LorcanaPicking.exe (1 a 3 minutes)...
echo.
python -m PyInstaller lorcana_picking.spec --noconfirm
if errorlevel 1 (
    echo.
    echo [ERREUR] La compilation a echoue. Lis les messages ci-dessus.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   SUCCES !
echo ====================================================
echo.
echo   Le logiciel est dans :  %CD%\dist\LorcanaPicking\
echo   Lance :                 LorcanaPicking.exe
echo.
echo   Tu peux copier le dossier "LorcanaPicking" ou tu veux.
echo   Tes donnees (config, emplacements, tags, cache) seront
echo   stockees a cote du .exe.
echo.
pause
