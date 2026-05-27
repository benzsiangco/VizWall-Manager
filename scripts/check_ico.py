import struct, os

path = r'src-tauri\icons\icon.ico'
with open(path, 'rb') as f:
    data = f.read()

# ICO header: reserved (2), type (2), count (2)
reserved, ico_type, count = struct.unpack('<HHH', data[:6])
print(f'Header: reserved={reserved} type={ico_type} count={count}')
print(f'File size: {len(data)} bytes\n')

# Each directory entry is 16 bytes
for i in range(count):
    off = 6 + i * 16
    entry = data[off:off+16]
    w, h, ncolors, reserved2, planes, bpp, size, offset = struct.unpack('<BBBBHHII', entry)
    real_w = w if w > 0 else 256
    real_h = h if h > 0 else 256
    # Check if data starts with PNG signature
    img_data = data[offset:offset+min(8, size)]
    is_png = img_data.startswith(b'\x89PNG\r\n\x1a\n')
    print(f'  Frame {i}: {real_w}x{real_h}  bpp={bpp}  size={size} bytes  PNG={is_png}')
