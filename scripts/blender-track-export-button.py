"""Embedded in the track .blend. Alt+P exports current edits; Ctrl+S saves source."""
from pathlib import Path
import shutil
import subprocess
import bpy

if not bpy.data.filepath:
    raise RuntimeError("Save the source under NIGHTSHIFT/assets/tracks/blackglass first")
project = Path(bpy.data.filepath).resolve().parents[3]
exporter = project / "scripts/export-blackglass.py"
optimizer = project / "scripts/optimize-track.mjs"
if not exporter.is_file() or not optimizer.is_file():
    raise RuntimeError("Keep the .blend in assets/tracks/blackglass so the exporter can locate the project")
node = shutil.which("node")
if not node:
    raise RuntimeError("Node is not on Blender's PATH; use pnpm track:export from the terminal")
exec(compile(exporter.read_text(), str(exporter), "exec"), {"__file__": str(exporter)})
subprocess.run([node, str(optimizer)], cwd=project, check=True,
               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
print("Blackglass exported and validated. Refresh the game.")
