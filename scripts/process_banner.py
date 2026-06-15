import os
from PIL import Image

src_path = r'C:\Users\Legion\.gemini\antigravity-ide\brain\e0c15620-b75b-46f4-8c6c-83fa13c8691b\media__1781487567273.png'
dest_path = r'c:\Users\Legion\Desktop\AI Nhà Thuốc\Medstand\images\banner-sea.jpg'

if os.path.exists(src_path):
    img = Image.open(src_path)
    w, h = img.size
    print(f"Image loaded. Size: {w}x{h}")
    
    # Paint over the icons in the top right corner
    for y in range(120):
        # Sample color slightly to the left of the icon area
        color = img.getpixel((830, y))
        for x in range(840, w):
            img.putpixel((x, y), color)
            
    # Save the modified image as JPEG
    img.convert('RGB').save(dest_path, 'JPEG', quality=95)
    print(f"Saved modified image to {dest_path}")
else:
    print(f"Error: Source image not found at {src_path}")
