# Script to open the MODEL main folder in Windows Explorer

MODEL_DIR="d:\\Workspace\\Py\\MODEL"

CURRENT_DIR="$(pwd)"
cd "$MODEL_DIR"

echo "$MODEL_DIR"
echo "Opening MODEL main folder in Windows Explorer..."
explorer.exe "$MODEL_DIR"
cd