REM Generate a diff file excluding specified directories and files
REM cspell: words numstat
REM set var with list of excluded files and directories
set EXCLUDED_FILES=^
    :(exclude)changes.diff ^
    :(exclude)uv.toml ^
    :(exclude)uv.lock ^
    :(exclude)requirements.txt ^
    :(exclude).github* ^
    :(exclude).roo* ^
    :(exclude).cline* ^
    :(exclude).venv/ ^
    :(exclude)notebooks/ ^
    :(exclude)git_diff*

set PARAMS= ^
    --unified=1 ^
    --ignore-all-space ^
    --ignore-space-change ^
    --ignore-blank-lines ^
    --ignore-space-at-eol ^
    --ignore-cr-at-eol

echo - Git Status: > changes.diff
git status -s >> changes.diff
echo. >> changes.diff

echo - Git Diff Numstat: >> changes.diff
git diff HEAD --numstat >> changes.diff
echo. >> changes.diff

echo - Git Diff (with ignore params): >> changes.diff
git diff HEAD %PARAMS% -- . %EXCLUDED_FILES% >> changes.diff