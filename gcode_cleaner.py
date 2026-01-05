#!/usr/bin/env python3

import sys
import os
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple
from enum import Enum


class MoveType(Enum):
    RAPID = "G0"
    LINEAR = "G1"
    UNKNOWN = "UNKNOWN"


@dataclass
class GCodeLine:
    """Represents a parsed G-code line"""
    raw: str
    line_number: int
    command: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    e: Optional[float] = None
    f: Optional[float] = None
    move_type: MoveType = MoveType.UNKNOWN
    is_comment: bool = False
    is_important: bool = False  # M-codes, G28, G92, etc.
    
    def is_move(self) -> bool:
        """Check if this is a movement command"""
        return self.move_type in [MoveType.RAPID, MoveType.LINEAR]
    
    def has_position_change(self, other: 'GCodeLine', tolerance: float = 0.0001) -> bool:
        """Check if position changed compared to another line"""
        if not self.is_move() or not other.is_move():
            return True
        
        x_change = abs((self.x or 0) - (other.x or 0)) > tolerance
        y_change = abs((self.y or 0) - (other.y or 0)) > tolerance
        z_change = abs((self.z or 0) - (other.z or 0)) > tolerance
        
        return x_change or y_change or z_change
    
    def distance_to(self, other: 'GCodeLine') -> float:
        """Calculate 3D distance to another position"""
        if not self.is_move() or not other.is_move():
            return float('inf')
        
        dx = (self.x or 0) - (other.x or 0)
        dy = (self.y or 0) - (other.y or 0)
        dz = (self.z or 0) - (other.z or 0)
        
        return (dx**2 + dy**2 + dz**2) ** 0.5
    
    def __str__(self) -> str:
        """Reconstruct G-code line"""
        return self.raw


class GCodeCleaner:
    """Clean and optimize G-code files"""
    
    def __init__(self):
        self.current_pos = {'x': 0.0, 'y': 0.0, 'z': 0.0, 'e': 0.0}
        self.position_mode = 'absolute'  # or 'relative'
        self.stats = {
            'total_lines': 0,
            'duplicate_positions': 0,
            'zero_distance_moves': 0,
            'redundant_retractions': 0,
            'redundant_g92': 0,
            'output_lines': 0
        }
    
    def parse_line(self, line: str, line_number: int) -> GCodeLine:
        """Parse a G-code line into structured format"""
        original = line
        line = line.strip()
        
        # Check if it's a comment or empty
        if not line or line.startswith(';'):
            return GCodeLine(
                raw=original,
                line_number=line_number,
                is_comment=True
            )
        
        # Extract comment if present
        if ';' in line:
            code_part = line.split(';')[0].strip()
            comment_part = ';' + ';'.join(line.split(';')[1:])
        else:
            code_part = line
            comment_part = ''
        
        parsed = GCodeLine(raw=original, line_number=line_number)
        
        # Parse command
        code_upper = code_part.upper()
        
        # Check for position mode changes
        if 'G90' in code_upper:
            self.position_mode = 'absolute'
            parsed.is_important = True
            parsed.command = 'G90'
            return parsed
        elif 'G91' in code_upper:
            self.position_mode = 'relative'
            parsed.is_important = True
            parsed.command = 'G91'
            return parsed

        if any(cmd in code_upper for cmd in ['M104', 'M109', 'M140', 'M190', 'M106', 'M107', 
                                               'M3', 'M03', 'M5', 'M05', 'M84', 'G28', 'G29']):
            parsed.is_important = True
            parsed.command = code_upper.split()[0] if code_upper.split() else None
            return parsed
        
        # Check for G92 
        if 'G92' in code_upper:
            parsed.is_important = True
            parsed.command = 'G92'
            e_match = re.search(r'E([-+]?[0-9]*\.?[0-9]+)', code_upper)
            if e_match:
                parsed.e = float(e_match.group(1))
            return parsed
        
        # Determine move type
        if 'G0' in code_upper or 'G00' in code_upper:
            parsed.move_type = MoveType.RAPID
            parsed.command = 'G0'
        elif 'G1' in code_upper or 'G01' in code_upper:
            parsed.move_type = MoveType.LINEAR
            parsed.command = 'G1'
        else:
            # Unknown command, keep it
            parsed.is_important = True
            return parsed
        
        # Parse coordinates
        x_match = re.search(r'X([-+]?[0-9]*\.?[0-9]+)', code_upper)
        y_match = re.search(r'Y([-+]?[0-9]*\.?[0-9]+)', code_upper)
        z_match = re.search(r'Z([-+]?[0-9]*\.?[0-9]+)', code_upper)
        e_match = re.search(r'E([-+]?[0-9]*\.?[0-9]+)', code_upper)
        f_match = re.search(r'F([-+]?[0-9]*\.?[0-9]+)', code_upper)
        
        # Update positions based on mode
        if self.position_mode == 'absolute':
            parsed.x = float(x_match.group(1)) if x_match else self.current_pos['x']
            parsed.y = float(y_match.group(1)) if y_match else self.current_pos['y']
            parsed.z = float(z_match.group(1)) if z_match else self.current_pos['z']
            parsed.e = float(e_match.group(1)) if e_match else None
        else:  # relative
            parsed.x = self.current_pos['x'] + (float(x_match.group(1)) if x_match else 0)
            parsed.y = self.current_pos['y'] + (float(y_match.group(1)) if y_match else 0)
            parsed.z = self.current_pos['z'] + (float(z_match.group(1)) if z_match else 0)
            parsed.e = float(e_match.group(1)) if e_match else None
        
        if f_match:
            parsed.f = float(f_match.group(1))
        
        # Update current position
        self.current_pos['x'] = parsed.x
        self.current_pos['y'] = parsed.y
        self.current_pos['z'] = parsed.z
        if parsed.e is not None:
            self.current_pos['e'] = parsed.e
        
        return parsed
    
    def is_duplicate_position(self, line: GCodeLine, prev_line: GCodeLine, 
                            tolerance: float = 0.0001) -> bool:
        """Check if this is a duplicate position move"""
        if not line.is_move() or not prev_line.is_move():
            return False
        

        same_position = (
            abs((line.x or 0) - (prev_line.x or 0)) < tolerance and
            abs((line.y or 0) - (prev_line.y or 0)) < tolerance and
            abs((line.z or 0) - (prev_line.z or 0)) < tolerance
        )
        

        line_extruding = line.e is not None and line.e > 0.01
        prev_extruding = prev_line.e is not None and prev_line.e > 0.01
        same_state = line_extruding == prev_extruding
        
        return same_position and same_state
    
    def is_zero_distance_move(self, line: GCodeLine, prev_line: GCodeLine, 
                             min_distance: float = 0.001) -> bool:
       
        if not line.is_move() or not prev_line.is_move():
            return False
        
        return line.distance_to(prev_line) < min_distance
    
    def is_redundant_g92(self, line: GCodeLine, prev_line: GCodeLine) -> bool:
      
        if line.command != 'G92' or prev_line.command != 'G92':
            return False
        
        return line.e == prev_line.e == 0.0
    
    def clean(self, input_lines: List[str], 
             remove_duplicates: bool = True,
             remove_zero_moves: bool = True,
             remove_redundant_g92: bool = True,
             min_move_distance: float = 0.001) -> List[str]:
      
        self.stats['total_lines'] = len(input_lines)
        
        parsed_lines = []
        for i, line in enumerate(input_lines, 1):
            parsed = self.parse_line(line, i)
            parsed_lines.append(parsed)
        
        cleaned_lines = []
        prev_move = None
        prev_g92 = None
        
        for i, line in enumerate(parsed_lines):
            keep_line = True
            
            if line.is_comment or line.is_important:
                if line.command == 'G92':
                    # Check for redundant G92
                    if remove_redundant_g92 and prev_g92 and self.is_redundant_g92(line, prev_g92):
                        keep_line = False
                        self.stats['redundant_g92'] += 1
                    else:
                        prev_g92 = line
                
                if keep_line:
                    cleaned_lines.append(line)
                continue
            
            # Process movement commands
            if line.is_move():

                if remove_duplicates and prev_move:
                    if self.is_duplicate_position(line, prev_move):
                        keep_line = False
                        self.stats['duplicate_positions'] += 1
                
                if keep_line and remove_zero_moves and prev_move:
                    if self.is_zero_distance_move(line, prev_move, min_move_distance):
                        keep_line = False
                        self.stats['zero_distance_moves'] += 1
                
                if keep_line:
                    cleaned_lines.append(line)
                    prev_move = line
            else:
              
                cleaned_lines.append(line)
        
        self.stats['output_lines'] = len(cleaned_lines)
        
        return [line.raw for line in cleaned_lines]
    
    def print_statistics(self):
        """Print cleaning statistics"""

        print(f"  Input lines:              {self.stats['total_lines']}")
        print(f"  Output lines:             {self.stats['output_lines']}")
        print(f"  Removed:                  {self.stats['total_lines'] - self.stats['output_lines']}")
        print(f"\n  Breakdown:")
        print(f"     Duplicate positions:  {self.stats['duplicate_positions']}")
        print(f"     Zero-distance moves:  {self.stats['zero_distance_moves']}")
        print(f"     Redundant G92 E0:     {self.stats['redundant_g92']}")
        
        reduction = (1 - self.stats['output_lines'] / self.stats['total_lines']) * 100
        print(f"\n  Size reduction:           {reduction:.1f}%")
    


def main():
    if len(sys.argv) < 2:
        print("\n" + "="*60)
        print("  G-code Cleaner - Remove Duplicate Move Commands")
       
        print("\nUsage:")
        print("  python gcode_cleaner.py <input.gcode> [output.gcode]\n")
        print("Arguments:")
        print("  input.gcode   : Input G-code file")
        print("  output.gcode  : (Optional) Output file")
        print("                  Default: input_cleaned.gcode\n")
        print("Features:")
        print("  • Removes duplicate consecutive positions")
        print("  • Removes zero-distance moves")
        print("  • Removes redundant G92 E0 commands")
        print("  • Preserves all comments and important commands")
        print("  • Maintains coordinate modes (G90/G91)\n")
        print("Examples:")
        print("  python gcode_cleaner.py part.gcode")
        print("  python gcode_cleaner.py part.gcode part_clean.gcode")
      
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not os.path.isfile(input_file):
        print(f"\n ERROR: File not found: {input_file}\n")
        sys.exit(1)
    
    
    if len(sys.argv) >= 3:
        output_file = sys.argv[2]
    else:
        base_name = os.path.splitext(input_file)[0]
        output_file = base_name + "_cleaned.gcode"
    

    print(f"\nInput:  {input_file}")
    print(f"Output: {output_file}")

  
    with open(input_file, 'r') as f:
        lines = f.readlines()

   
    cleaner = GCodeCleaner()
    cleaned_lines = cleaner.clean(
        lines,
        remove_duplicates=True,
        remove_zero_moves=True,
        remove_redundant_g92=True,
        min_move_distance=0.001
    )
    
  
 
    with open(output_file, 'w') as f:
        f.writelines(cleaned_lines)

    cleaner.print_statistics()
    
    print(f"✓ Cleaned G-code saved to: {output_file}\n")


if __name__ == "__main__":
    main()