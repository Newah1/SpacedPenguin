#!/usr/bin/env python3
import os
import json
import shutil
from PIL import Image

def load_asset_mapping():
    """Load the asset mapping from JSON"""
    with open('OldSource/Assets/spaced_penguin/asset_mapping.json', 'r') as f:
        return json.load(f)

def organize_assets():
    """Organize assets into the new folder structure"""
    mapping = load_asset_mapping()
    
    # Create destination directories
    base_dirs = ['assets/sprites', 'assets/ui', 'assets/planets', 'assets/animations', 'assets/audio']
    for dir_path in base_dirs:
        os.makedirs(dir_path, exist_ok=True)
    
    # Track animation frames for sprite sheet creation
    animation_frames = {
        'penguin_spin_xc': [],
        'penguin_spin_yc': [],
        'penguin_spin_zc': []
    }
    
    # Copy and organize files
    for asset in mapping:
        filename = asset['filename']
        category = asset['category']
        usage = asset['usage']
        original_name = asset['original_name']
        
        source_path = f"OldSource/Assets/spaced_penguin/{filename}"
        
        if not os.path.exists(source_path):
            print(f"Warning: {source_path} not found")
            continue
        
        # Determine destination based on category
        if category == 'penguin_animation':
            # Only collect animation frames for sprite sheet creation, do not copy individually
            animation_group = asset['animation_group']
            frame_num = asset['frame_number']
            animation_key = f"penguin_spin_{animation_group.lower()}"
            animation_frames[animation_key].append({
                'source': source_path,
                'frame': frame_num,
                'registration': asset['registration_point']
            })
            continue  # Skip copying individual animation frames
        elif category == 'planet':
            dest_path = f"assets/planets/{usage}.png"
            if filename.endswith('.swf'):
                dest_path = f"assets/planets/{usage}.swf"
        elif category == 'ui':
            dest_path = f"assets/ui/{usage}.png"
            if filename.endswith('.swf'):
                dest_path = f"assets/ui/{usage}.swf"
        elif category == 'game_object':
            dest_path = f"assets/sprites/{usage}.png"
            if filename.endswith('.swf'):
                dest_path = f"assets/sprites/{usage}.swf"
        elif category == 'bonus':
            dest_path = f"assets/sprites/{usage}.swf"
        elif category == 'background':
            dest_path = f"assets/ui/{usage}.png"
        else:
            dest_path = f"assets/sprites/{usage}.png"
            if filename.endswith('.swf'):
                dest_path = f"assets/sprites/{usage}.swf"
        
        # Copy file
        try:
            shutil.copy2(source_path, dest_path)
            print(f"Copied {filename} -> {dest_path}")
        except Exception as e:
            print(f"Error copying {filename}: {e}")
    
    # Create sprite sheets for animations
    create_sprite_sheets(animation_frames)

def create_sprite_sheets(animation_frames):
    """Create sprite sheets from animation frames"""
    for animation_name, frames in animation_frames.items():
        if not frames:
            continue
            
        # Sort frames by frame number
        frames.sort(key=lambda x: x['frame'])
        
        # Load all images
        images = []
        max_width = 0
        max_height = 0
        
        for frame_data in frames:
            try:
                img = Image.open(frame_data['source']).convert('RGBA')
                images.append(img)
                max_width = max(max_width, img.width)
                max_height = max(max_height, img.height)
            except Exception as e:
                print(f"Error loading {frame_data['source']}: {e}")
        
        if not images:
            continue
        
        # Create sprite sheet
        sheet_width = max_width * len(images)
        sheet_height = max_height
        
        sprite_sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))
        
        for i, img in enumerate(images):
            x = i * max_width
            y = 0
            sprite_sheet.paste(img, (x, y), img)
        
        # Save sprite sheet
        sheet_path = f"assets/animations/{animation_name}_sheet.png"
        sprite_sheet.save(sheet_path)
        print(f"Created sprite sheet: {sheet_path}")
        
        # Create animation metadata
        metadata = {
            'name': animation_name,
            'frame_count': len(frames),
            'frame_width': max_width,
            'frame_height': max_height,
            'frames': [frame_data['frame'] for frame_data in frames],
            'registration_points': [frame_data['registration'] for frame_data in frames]
        }
        
        metadata_path = f"assets/animations/{animation_name}_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"Created metadata: {metadata_path}")

def copy_audio_files():
    """Copy audio files to the audio directory"""
    audio_files = [
        'Internal_15_Arp.wav',
        'Internal_16_snd_bonus.wav', 
        'Internal_17_snd_launch.wav',
        'Internal_20_snd_HitPlanet.wav',
        'Internal_21_snd_enterShip.wav'
    ]
    
    for audio_file in audio_files:
        source_path = f"OldSource/Assets/spaced_penguin/{audio_file}"
        if os.path.exists(source_path):
            dest_path = f"assets/audio/{audio_file.replace('Internal_', '')}"
            shutil.copy2(source_path, dest_path)
            print(f"Copied audio: {audio_file} -> {dest_path}")

def create_asset_manifest():
    """Create a manifest file for easy asset loading"""
    manifest = {
        'sprites': {},
        'ui': {},
        'planets': {},
        'animations': {},
        'audio': {}
    }
    
    # Scan directories and build manifest
    for category in manifest.keys():
        dir_path = f"assets/{category}"
        if os.path.exists(dir_path):
            for filename in os.listdir(dir_path):
                if filename.endswith(('.png', '.swf', '.wav')):
                    name = os.path.splitext(filename)[0]
                    manifest[category][name] = f"{category}/{filename}"
    
    with open('assets/manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print("Created asset manifest: assets/manifest.json")

if __name__ == "__main__":
    print("Organizing assets...")
    organize_assets()
    copy_audio_files()
    create_asset_manifest()
    print("Asset organization complete!") 