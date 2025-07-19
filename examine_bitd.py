#!/usr/bin/env python3
import os
import struct
import json

def examine_bitd_file(filename):
    """Examine a BITD file and print its structure"""
    print(f"\n=== Examining {filename} ===")
    
    with open(filename, 'rb') as f:
        data = f.read()
    
    print(f"File size: {len(data)} bytes")
    
    # Print first 64 bytes as hex
    hex_data = ' '.join(f'{b:02X}' for b in data[:64])
    print(f"First 64 bytes: {hex_data}")
    
    # Try to interpret as different formats
    if len(data) >= 8:
        # Try to read as 32-bit integers
        try:
            values = struct.unpack('<II', data[:8])
            print(f"First two 32-bit values: {values}")
        except:
            pass
        
        try:
            values = struct.unpack('>II', data[:8])
            print(f"First two 32-bit values (big-endian): {values}")
        except:
            pass
    
    # Look for common bitmap patterns
    if len(data) >= 4:
        width = struct.unpack('<H', data[:2])[0]
        height = struct.unpack('<H', data[2:4])[0]
        print(f"Possible width/height (16-bit): {width} x {height}")
        
        if len(data) >= 8:
            width32 = struct.unpack('<I', data[:4])[0]
            height32 = struct.unpack('<I', data[4:8])[0]
            print(f"Possible width/height (32-bit): {width32} x {height32}")

def main():
    # Get all BITD files
    bitd_dir = "OldSource/spaced_penguin/chunks"
    bitd_files = [f for f in os.listdir(bitd_dir) if f.startswith('BITD-') and f.endswith('.bin')]
    
    print(f"Found {len(bitd_files)} BITD files")
    
    # Sort by size
    bitd_files.sort(key=lambda f: os.path.getsize(os.path.join(bitd_dir, f)))
    
    # Examine a few files of different sizes
    for i, filename in enumerate(bitd_files[:5]):
        full_path = os.path.join(bitd_dir, filename)
        examine_bitd_file(full_path)
    
    # Also examine the largest file
    largest_file = max(bitd_files, key=lambda f: os.path.getsize(os.path.join(bitd_dir, f)))
    examine_bitd_file(os.path.join(bitd_dir, largest_file))

if __name__ == "__main__":
    main() 