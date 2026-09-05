"""Embedded in the .blend as 'Export to NIGHTSHIFT.py'. Run with Alt+P.

Exports the currently opened scene, including unsaved geometry edits. Save with
Ctrl+S as well if those edits should become the persistent authoring source.
"""
from pathlib import Path
import shutil
import subprocess
import bpy

if not bpy.data.filepath:
    raise RuntimeError("Save this car under the project's assets/cars folder first")
project = Path(bpy.data.filepath).resolve().parents[2]
export_script = project / "scripts/export-coupe.py"
optimize_script = project / "scripts/optimize-car.mjs"
if not export_script.is_file() or not optimize_script.is_file():
    raise RuntimeError("Keep the source .blend in NIGHTSHIFT/assets/cars so the exporter can find the project")
node = shutil.which("node")
if not node:
    raise RuntimeError("Node.js is not on Blender's PATH; use the terminal export command instead")
exec(compile(export_script.read_text(), str(export_script), "exec"), {"__file__": str(export_script)})
subprocess.run([node, str(optimize_script)], cwd=project, check=True,
               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
print("NS-01 exported and validated. Refresh the game to see your edits.")
