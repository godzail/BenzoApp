# Generate a diff file excluding specified directories and files
OUTPUT_FILE="changes.diff"
# Set array with list of excluded files and directories
EXCLUDED_FILES=(
    ":!${OUTPUT_FILE}"
    ':!uv.toml'
    ':!uv.lock'
    ':!*requirements.txt'
    ':!.github*'
    ':!.roo*'
    ':!.cline*'
    ':!.venv/'
    ':!notebooks/'
    ':!git_diff*'
)

PARAMS=(
    --unified=1
    --ignore-all-space
    --ignore-space-change
    --ignore-blank-lines
    --ignore-space-at-eol
    --ignore-cr-at-eol
)

# Write git status to "$OUTPUT_FILE"
echo "- Git Status:" > "$OUTPUT_FILE"
git status -s >> "$OUTPUT_FILE"
echo >> "$OUTPUT_FILE"

# Write git diff numstat to "$OUTPUT_FILE"
echo "- Git Diff Numstat:" >> "$OUTPUT_FILE"
git diff HEAD --numstat >> "$OUTPUT_FILE"
echo >> "$OUTPUT_FILE"

# Write git diff with ignore params to "$OUTPUT_FILE"
echo "- Git Diff (with ignore params):" >> "$OUTPUT_FILE"
git diff HEAD "${PARAMS[@]}" -- . "${EXCLUDED_FILES[@]}" >> "$OUTPUT_FILE"
echo -e "File \033[36m\"./$OUTPUT_FILE\"\033[0m has been generated."

# Report number of lines in the generated file
if command -v wc >/dev/null 2>&1; then
    line_count=$(wc -l < "$OUTPUT_FILE")
else
    line_count=$(awk 'END{print NR}' "$OUTPUT_FILE" 2>/dev/null || echo "0")
fi
echo "- Lines in \"$OUTPUT_FILE\": $line_count"