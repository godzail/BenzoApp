echo "Initializing instruction setup..."  # Added message
# Change to the root directory
cd "$(dirname "$0")/.." || exit 1

source_instructions=.github/copilot-instructions.md
source_py_instructions=.github/instructions/py.instructions.md

source_ignore=.rooignore

roo_rules_dir=./.roo/rules
cline_rules_dir=./.clinerules

# list files to hardlink from copilot-instructions.md
instructions_hardlink=(
    "$roo_rules_dir/instructions.md"
    "$cline_rules_dir/instructions.md"
    gemini.md
)

py_instructions_hardlink=(
    "$roo_rules_dir/py.instructions.md"
    "$cline_rules_dir/py.instructions.md"
)

ignore_hardlink=(
    .geminiignore
    .clineignore
)

# if hardlinks exists remove
for file in "${instructions_hardlink[@]}" "${py_instructions_hardlink[@]}" "${ignore_hardlink[@]}"; do
    [ -f "$file" ] && rm "$file"
done

mkdir -p "$roo_rules_dir"
mkdir -p "$cline_rules_dir"

# loop instructions to create hardlinks
for file in "${instructions_hardlink[@]}"; do
    ln "$source_instructions" "$file"
done

for file in "${py_instructions_hardlink[@]}"; do
    ln "$source_py_instructions" "$file"
done


# if source_ignore not exists copy from .gitignore
if [ ! -f "$source_ignore" ]; then
    cp .gitignore "$source_ignore"
fi

# create hardlinks for ignore files
for file in "${ignore_hardlink[@]}"; do
    ln "$source_ignore" "$file"
done

echo "Instruction setup complete."  # Added message