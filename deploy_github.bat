@echo off
echo === INICIALIZANDO REPOSITORIO GIT LOCAL ===
git init
git add .
git commit -m "Initial commit - leads funnel dashboard - unique visits logic"

echo.
echo === CONFIGURANDO REMOTO E ENVIANDO PARA O GITHUB ===
git branch -M main
git remote remove origin 2>nul
git remote add origin https://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@github.com/luantabaldi/dash-cv.git

echo Enviando arquivos...
git push -u origin main

echo.
echo === CONCLUIDO ===
pause
