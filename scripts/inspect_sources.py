"""Inspect every potential icon source so we know what real resolution we have."""
from PIL import Image
import os

candidates = [
    r'public\favicon.ico',
    r'public\app-icon.png',
    r'public\vizwall-logo.png',
    r'vizwall-logo.png',
]

for c in candidates:
    if not os.path.exists(c):
        print(f'MISSING: {c}')
        continue
    img = Image.open(c)
    print(f'\n=== {c}  ({os.path.getsize(c)//1024} KB) ===')
    if c.lower().endswith('.ico'):
        i = 0
        try:
            while True:
                img.seek(i)
                print(f'  Frame {i}: {img.size}  mode={img.mode}')
                i += 1
        except EOFError:
            pass
    else:
        print(f'  Size: {img.size}  mode={img.mode}')
