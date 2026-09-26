"""Remove o fundo de todos os PNGs de uma pasta com o rembg (IA local).
uso: python scripts/rembg_frames.py <entrada> <saida> [modelo]"""
import sys, pathlib
from rembg import new_session, remove
from PIL import Image

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
model = sys.argv[3] if len(sys.argv) > 3 else "isnet-general-use"
dst.mkdir(parents=True, exist_ok=True)
session = new_session(model)
files = [f for f in sorted(src.glob("*.png")) if not (dst / f.name).exists()]
for i, f in enumerate(files, 1):
    out = remove(Image.open(f).convert("RGB"), session=session, post_process_mask=True)
    out.save(dst / f.name)
    print(f"\r{i}/{len(files)}", end="", flush=True)
print()
