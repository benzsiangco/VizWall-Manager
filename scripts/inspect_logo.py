from PIL import Image
import os

files = [
    r'public\vizwall-logo.png',
    r'vizwall-logo.png',
    r'public\app-icon.png',
    r'public\favicon.ico',
]
for f in files:
    if os.path.exists(f):
        img = Image.open(f)
        print(f'{f}: {img.size}  mode={img.mode}  {os.path.getsize(f)//1024} KB')
    else:
        print(f'MISSING: {f}')
