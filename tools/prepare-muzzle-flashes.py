"""Downscale a muzzle-flash sprite pack for the battle.

The supplied pack is 13 end-on flash images at 1254 px (~13 MB). A flash covers a few dozen pixels
for ~50 ms, so each is resized to 256 px (Lanczos) and written as optimised PNG. The source images
are already centred on the flash, which is what the runtime puts at the muzzle.

  python3 tools/prepare-muzzle-flashes.py --input muzzle_flash_13_pack.zip --output Assets/effects/muzzle-flash
"""
import argparse
import io
import os
import zipfile

from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="zip or folder of PNGs")
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", type=int, default=256)
    o = parser.parse_args()
    if o.input.endswith(".zip"):
        with zipfile.ZipFile(o.input) as z:
            images = [(os.path.basename(n), Image.open(io.BytesIO(z.read(n))))
                      for n in sorted(z.namelist()) if n.lower().endswith(".png")]
    else:
        images = [(n, Image.open(os.path.join(o.input, n))) for n in sorted(os.listdir(o.input)) if n.lower().endswith(".png")]
    os.makedirs(o.output, exist_ok=True)
    for i, (name, image) in enumerate(images, 1):
        image = image.convert("RGBA").resize((o.size, o.size), Image.LANCZOS)
        path = os.path.join(o.output, "%02d.png" % i)
        image.save(path, optimize=True)
        print("%s <- %s (%d KB)" % (path, name, os.path.getsize(path) // 1024))


if __name__ == "__main__":
    main()
