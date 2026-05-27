"""
VizWall Icon Generator — high-resolution version.

Source:  public/app-icon.png  (512x512 RGBA — highest quality source)
Output:  src-tauri/icons/  + public/favicon.ico

Strategy
--------
- Use the 512x512 PNG as master — no upscaling needed, only downsampling.
- 256x256 frame: stored as PNG inside the ICO (Windows taskbar at high DPI).
- All other frames (128/64/48/32/16): stored as 32-bit BMP inside the ICO.
  Windows shell picks BMP frames for small sizes; PNG for 256.
- Apply per-size UnsharpMask AFTER downsampling to recover edge definition.

Result: crisp taskbar icon (PNG 256) + crisp desktop icon (BMP 48/32).
"""

from PIL import Image, ImageFilter, ImageEnhance
import os, sys, struct, io

PROJECT_ROOT = r'd:\Benz Siangco Creatives\VibeCode\VizWall Manager'
SRC_PNG   = os.path.join(PROJECT_ROOT, 'public', 'app-icon.png')   # 512x512 source
ICONS_DIR = os.path.join(PROJECT_ROOT, 'src-tauri', 'icons')
PUB_ICO   = os.path.join(PROJECT_ROOT, 'public', 'favicon.ico')


def load_master(path: str) -> Image.Image:
    img = Image.open(path).convert('RGBA')
    print(f'Source: {path}  {img.size[0]}x{img.size[1]}  mode={img.mode}')
    return img


def make_frame(master: Image.Image, size: int) -> Image.Image:
    """Single-step LANCZOS downsample then size-tuned sharpening."""
    if master.size == (size, size):
        out = master.copy()
    else:
        out = master.resize((size, size), Image.LANCZOS)

    # Sharpening profile — stronger for smaller sizes
    if size >= 512:
        params = dict(radius=0.4, percent=50, threshold=2)
    elif size >= 256:
        params = dict(radius=0.5, percent=70, threshold=2)
    elif size >= 128:
        params = dict(radius=0.6, percent=100, threshold=1)
    elif size >= 64:
        params = dict(radius=0.7, percent=130, threshold=1)
    elif size >= 48:
        params = dict(radius=0.8, percent=160, threshold=0)
    elif size >= 32:
        params = dict(radius=0.9, percent=190, threshold=0)
    else:  # 16
        params = dict(radius=1.0, percent=230, threshold=0)

    out = out.filter(ImageFilter.UnsharpMask(**params))
    out = ImageEnhance.Contrast(out).enhance(1.03)
    return out


def frame_to_png_bytes(img: Image.Image) -> bytes:
    """Encode as PNG (used for 256x256 — taskbar)."""
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def frame_to_bmp_bytes(img: Image.Image) -> bytes:
    """Encode as 32-bit ARGB BMP (used for <=128 — desktop/shell).

    Windows ICO BMP format:
    - BITMAPINFOHEADER (40 bytes) with height doubled (XOR + AND masks)
    - Pixel data: BGRA rows bottom-to-top
    - AND mask: all zeros (we use full alpha channel)
    """
    w, h = img.size
    img = img.convert('RGBA')
    pixels = list(img.getdata())

    bih = struct.pack(
        '<IiiHHIIiiII',
        40,     # biSize
        w,      # biWidth
        h * 2,  # biHeight (doubled for ICO)
        1,      # biPlanes
        32,     # biBitCount
        0,      # biCompression (BI_RGB)
        0,      # biSizeImage
        0, 0,   # biXPelsPerMeter, biYPelsPerMeter
        0, 0,   # biClrUsed, biClrImportant
    )

    row_bytes = b''
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            row_bytes += struct.pack('BBBB', b, g, r, a)

    mask_row_size = ((w + 31) // 32) * 4
    and_mask = b'\x00' * (mask_row_size * h)

    return bih + row_bytes + and_mask


def build_ico(frames: list) -> bytes:
    """Build ICO file from (size, raw_image_bytes) pairs."""
    n = len(frames)
    header = struct.pack('<HHH', 0, 1, n)
    dir_size = n * 16
    data_offset = 6 + dir_size

    directory = b''
    blob = b''
    cursor = data_offset
    for size, data in frames:
        w = size if size < 256 else 0   # 0 = 256 in ICO spec
        h = size if size < 256 else 0
        directory += struct.pack(
            '<BBBBHHII',
            w, h, 0, 0, 1, 32, len(data), cursor,
        )
        blob += data
        cursor += len(data)

    return header + directory + blob


def main() -> None:
    if not os.path.exists(SRC_PNG):
        print(f'ERROR: Source not found: {SRC_PNG}')
        sys.exit(1)

    master = load_master(SRC_PNG)
    print(f'Master: {master.size[0]}x{master.size[1]} (no upscaling needed)\n')

    # ── Tauri PNG slots ──────────────────────────────────────────────────
    png_outputs = {
        'icon.png':       512,   # Tauri primary PNG — full resolution
        '128x128@2x.png': 256,
        '128x128.png':    128,
        '32x32.png':       32,
    }
    print('Generating PNGs:')
    for fname, size in png_outputs.items():
        out = make_frame(master, size)
        path = os.path.join(ICONS_DIR, fname)
        out.save(path, 'PNG', optimize=True)
        print(f'  {fname}: {size}x{size}  ({os.path.getsize(path)//1024} KB)')

    # ── Multi-resolution ICO ─────────────────────────────────────────────
    # 256x256 → PNG-compressed  (Windows taskbar at high DPI)
    # all others → 32-bit BMP   (Windows shell/desktop uses BMP for small sizes)
    print('\nGenerating ICO frames:')
    ico_sizes = [256, 128, 64, 48, 32, 16]
    frames = []
    for size in ico_sizes:
        frame = make_frame(master, size)
        if size == 256:
            data = frame_to_png_bytes(frame)
            enc = 'PNG'
        else:
            data = frame_to_bmp_bytes(frame)
            enc = 'BMP'
        frames.append((size, data))
        print(f'  {size:3d}x{size:<3d}  {len(data)//1024:3d} KB  {enc}')

    ico_data = build_ico(frames)

    ico_path = os.path.join(ICONS_DIR, 'icon.ico')
    with open(ico_path, 'wb') as f:
        f.write(ico_data)
    print(f'\nWrote {ico_path}  ({len(ico_data)//1024} KB)')

    with open(PUB_ICO, 'wb') as f:
        f.write(ico_data)
    print(f'Wrote {PUB_ICO}  (browser favicon)')

    print('\nDone.')
    print('  Source: 512x512 PNG (no upscaling)')
    print('  256x256 PNG  → taskbar (high-DPI, crisp)')
    print('  48x48   BMP  → desktop shortcut icon (crisp)')
    print('  32x32   BMP  → small shell views (crisp)')


if __name__ == '__main__':
    main()
