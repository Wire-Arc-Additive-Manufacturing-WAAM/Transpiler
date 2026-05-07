"""Torch on issues due to motion blending solved + Sinusoidal weaving for improved bead morphology"""

import os
import sys
import re
import json
import math
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "waam_config.json"

# Load config
if CONFIG_PATH.exists():
    with open(CONFIG_PATH, 'r') as f:
        _cfg = json.load(f)
else:
    _cfg = {}

ROBOT_SPECS = _cfg.get('robot_specs', {
    'reach': 900,
    'payload': 6,
    'default_travel_speed': 0.005,
    'default_weld_speed': 0.005,
})

PRUSA_SLICER_ORIGIN = _cfg.get('prusa_origin', {'x': 0, 'y': 0, 'z': -2})
TAUGHT_START_ENABLED = _cfg.get('taught_start_position', {}).get('enabled', True)
TAUGHT_START_SAFETY_DELAY = _cfg.get('taught_start_position', {}).get('safety_delay_seconds', 15.0)
WAAM_PARAMS = _cfg.get('waam_params', {
    'inter_layer_delay': 30.0,
    'min_extrusion_threshold': 0.01,
    'torch_output': 1,
    'apo_cdis': 0.25,
    'auto_prusa_origin': False,
    # Motion + torch state transitions
    'pre_flow': 0.2,           
    'post_flow': 0.2,          
    'blend_within_bead': True,
    # NEW: Weaving parameters
    'weaving_enabled': False,      # Enable/disable weaving
    'weaving_amplitude': 2.0,      # Amplitude in mm (half-width of weave)
    'weaving_frequency': 2.0,      # Cycles per unit length (adjust based on speed)
    'weaving_points_per_cycle': 8, # Points to generate per sine wave cycle
})

HEADER_SRC = """DEF {program_name}()
;FOLD INI
  ;FOLD BASISTECH INI
    BAS (#INITMOV,0)
  ;ENDFOLD (BASISTECH INI)
  ;FOLD USER INI
    ;WAAM-optimized initialization with weaving capability
  ;ENDFOLD (USER INI)
;ENDFOLD (INI)

BASE_DATA[10] = {{FRAME: X 270.73, Y -630.81, Z 710.35, A 179.93, B -0.22, C -1.44}}
TOOL_DATA[6] = {{FRAME: X -14.67, Y -33.93, Z 286.30, A 0, B 0, C 0}}
$BASE = BASE_DATA[10]
$TOOL = TOOL_DATA[6]

BAS (#VEL_PTP,100)
BAS (#ACC_PTP,100)
BAS (#VEL_CP,{default_travel_speed:.4f})
BAS (#ACC_CP,0.05)

$VEL.CP = {default_travel_speed:.4f}
$ACC.CP = 0.05
$VEL.ORI1 = 90
$VEL.ORI2 = 90
$ACC.ORI1 = 500
$ACC.ORI2 = 500
$ORI_TYPE = #VAR
$ADVANCE = 3
$APO.CDIS = {apo_cdis:.2f}
$OV_PRO = 100

"""

HEADER_DAT = """DEFDAT {program_name} PUBLIC

DECL E6POS TAUGHT_START
DECL E6POS TARGET_POS
DECL E6POS OFFSET_POS
DECL BOOL TEMP_VAR  ; temperature-ready flag

DECL E6POS HOME={{X -183.3,Y -17.4,Z 38.3,A 129.7,B -46.5,C 162.4,S 18,T 34}}
ENDDAT
"""

FOOTER_SRC = """
;===========
; WAAM PROCESS COMPLETE
;===========

$VEL.CP = {default_travel_speed:.4f}
LIN_REL {{Z 30}}
WAIT SEC 0
$OV_PRO = 10
PTP HOME

END
"""


@dataclass
class Point:
    x: float
    y: float
    z: float
    welding: bool = False
    feed_rate: Optional[float] = None  
    e: Optional[float] = None
    raw_line: Optional[str] = None


class TunedTranspiler:
    def __init__(self):
        self.current_pos = (0.0, 0.0, 0.0)
        self.welding = False
        self.points: List[Point] = []
        self.prusa_origin = dict(PRUSA_SLICER_ORIGIN)
        self.use_taught_position = TAUGHT_START_ENABLED
        self.first_weld_point = None  # Will store transformed coords of first weld

    def transform(self, x: float, y: float, z: float):
        """Transform G-code coordinates to robot base coordinates"""
        x_b = self.prusa_origin.get('x', PRUSA_SLICER_ORIGIN.get('x', 0)) + x
        y_b = self.prusa_origin.get('y', PRUSA_SLICER_ORIGIN.get('y', 0)) + y
        z_b = self.prusa_origin.get('z', PRUSA_SLICER_ORIGIN.get('z', -2)) + z
        return x_b, y_b, z_b
    
    def find_first_weld_point(self):
        """Find and store the transformed coordinates of the first weld point"""
        for p in self.points:
            if p.welding:
                self.first_weld_point = self.transform(p.x, p.y, p.z)
                return
    
    def parse_gcode(self, lines: List[str]):
        pos_mode = 'absolute'
        last_e = 0.0
        first_x = None
        first_y = None
        for l in lines:
            s = l.strip()
            if not s or s.startswith(';'):
                # To detect layers
                if ';LAYER_CHANGE' in s or ';Z:' in s:
                    self.points.append(Point(0,0,0, welding=False, raw_line=s))
                continue
            up = s.upper()
            if 'G90' in up:
                pos_mode = 'absolute'
                continue
            if 'G91' in up:
                pos_mode = 'relative'
                continue
            # detect F
            f = None
            fm = re.search(r'F([-+]?[0-9]*\.?[0-9]+)', up)
            if fm:
                f = float(fm.group(1))
            xm = re.search(r'X([-+]?[0-9]*\.?[0-9]+)', up)
            ym = re.search(r'Y([-+]?[0-9]*\.?[0-9]+)', up)
            zm = re.search(r'Z([-+]?[0-9]*\.?[0-9]+)', up)
            em = re.search(r'E([-+]?[0-9]*\.?[0-9]+)', up)
            x = self.current_pos[0]
            y = self.current_pos[1]
            z = self.current_pos[2]
            e = None
            if xm:
                xv = float(xm.group(1))
                abs_x = xv if pos_mode == 'absolute' else x + xv
                if first_x is None:
                    first_x = abs_x
                x = abs_x
            if ym:
                yv = float(ym.group(1))
                abs_y = yv if pos_mode == 'absolute' else y + yv
                if first_y is None:
                    first_y = abs_y
                y = abs_y
            if zm:
                zv = float(zm.group(1))
                z = zv if pos_mode == 'absolute' else z + zv
            if em:
                e = float(em.group(1))
            welding = False
            if e is not None:
                if e - last_e > WAAM_PARAMS.get('min_extrusion_threshold', 0.01):
                    welding = True
                last_e = e
            p = Point(x, y, z, welding=welding, feed_rate=f, e=e, raw_line=s)
            self.points.append(p)
            self.current_pos = (x, y, z)

    def feed_to_velcp(self, f_mm_per_min: float) -> float:
        return max(0.0001, min(ROBOT_SPECS.get('max_tcp_speed', 0.3), f_mm_per_min / 60000.0))

    def format_pos(self, x: float, y: float, z: float) -> str:
        """Format position for KRL output"""
        xb, yb, zb = self.transform(x, y, z)
        
        if self.use_taught_position and self.first_weld_point:
            # Calculate offset from first weld point for X and Y only
            # Z remains absolute to maintain proper layer heights
            dx = xb - self.first_weld_point[0]
            dy = yb - self.first_weld_point[1]
            # Return as relative offset for X,Y and absolute for Z
            return f"{{X {dx:.3f}, Y {dy:.3f}, Z {zb:.3f}, A 0, B 0, C 0}}"
        else:
            # Return as absolute position
            return f"{{X {xb:.3f}, Y {yb:.3f}, Z {zb:.3f}, A 129.7, B -46.5, C 162.4}}"

    def generate_weave_points(self, p1: Point, p2: Point) -> List[tuple]:
        """
        Generate intermediate points with sinusoidal oscillation perpendicular to travel direction.
        Returns list of (x, y, z) tuples representing the weaved path.
        """
        if not WAAM_PARAMS.get('weaving_enabled', False):
            return [(p2.x, p2.y, p2.z)]
        
        # Calculate travel vector
        dx = p2.x - p1.x
        dy = p2.y - p1.y
        dz = p2.z - p1.z
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        
        # Skip weaving for very short segments
        if length < 0.5:
            return [(p2.x, p2.y, p2.z)]
        
        # Weaving parameters
        amplitude = WAAM_PARAMS.get('weaving_amplitude', 2.0)
        frequency = WAAM_PARAMS.get('weaving_frequency', 2.0)
        points_per_cycle = WAAM_PARAMS.get('weaving_points_per_cycle', 8)
        
        # Calculate perpendicular vector in XY plane (most common for WAAM)
        # Perpendicular to (dx, dy) is (-dy, dx)
        perp_mag = math.sqrt(dx*dx + dy*dy)
        if perp_mag < 0.001:  # Purely vertical move, no weaving
            return [(p2.x, p2.y, p2.z)]
        
        perp_x = -dy / perp_mag
        perp_y = dx / perp_mag
        
        # Generate weave points
        num_cycles = frequency * length
        total_points = max(2, int(num_cycles * points_per_cycle))
        
        weave_points = []
        for i in range(1, total_points + 1):
            t = i / total_points  # Progress along segment [0, 1]
            
            # Position along the linear path
            base_x = p1.x + t * dx
            base_y = p1.y + t * dy
            base_z = p1.z + t * dz
            
            # Sinusoidal offset perpendicular to path
            phase = 2 * math.pi * frequency * t * length
            offset = amplitude * math.sin(phase)
            
            # Apply offset in perpendicular direction
            weave_x = base_x + offset * perp_x
            weave_y = base_y + offset * perp_y
            weave_z = base_z  # Keep Z linear (no vertical oscillation)
            
            weave_points.append((weave_x, weave_y, weave_z))
        
        return weave_points

    def generate_krl(self, program_name: str = "WAAM_PART") -> str:
        k = []
        header = HEADER_SRC.format(
            program_name=program_name,
            default_travel_speed=ROBOT_SPECS.get('default_travel_speed', 0.005),
            apo_cdis=WAAM_PARAMS.get('apo_cdis', 0.25),
            torch_output=WAAM_PARAMS.get('torch_output', 1)
        )
        k.append(header)
        
        # Conditional HOME position - skip if using taught position
        if not self.use_taught_position:
            k.append("; Moving to HOME position before starting\n")
            k.append("PTP HOME\n")
            k.append("CONTINUE\n")
            k.append(f"$OUT[{WAAM_PARAMS.get('torch_output', 1)}] = FALSE\n\n")
        else:
            k.append("; Taught position mode - skipping HOME move\n")
            k.append("; Robot should already be at desired starting position\n")
            k.append(f"$OUT[{WAAM_PARAMS.get('torch_output', 1)}] = FALSE\n\n")
        
        k.append(";===========\n")
        k.append("; BEGIN WAAM PROCESS\n")
        k.append(";===========\n\n")
        
        # Parse layers
        layers = []
        current_layer: List[Point] = []
        for p in self.points:
            if p.raw_line and (p.raw_line.startswith(';LAYER_CHANGE') or p.raw_line.startswith(';Z:')):
                if current_layer:
                    layers.append(current_layer)
                current_layer = [p]
            else:
                current_layer.append(p)
        if current_layer:
            layers.append(current_layer)

        # Refine welding detection per-layer
        for layer_points in layers:
            prev_e = 0.0
            for i_pt, pt in enumerate(layer_points):
                if pt.e is None:
                    continue
                if pt.e - prev_e > WAAM_PARAMS.get('min_extrusion_threshold', 0.01):
                    pt.welding = True
                    if i_pt > 0:
                        prev_pt = layer_points[i_pt-1]
                        if not (prev_pt.raw_line and (prev_pt.raw_line.startswith(';LAYER_CHANGE') or prev_pt.raw_line.startswith(';Z:'))):
                            prev_pt.welding = True
                prev_e = pt.e

        # Apply auto prusa origin if not using taught position
        if WAAM_PARAMS.get('auto_prusa_origin', False) and not self.use_taught_position:
            first_weld = None
            for p in self.points:
                if p.welding:
                    first_weld = p
                    break
            if first_weld:
                self.prusa_origin['x'] = -first_weld.x + 0
                self.prusa_origin['y'] = -first_weld.y -57.808
                k.append(f"; Auto prusa origin applied: x={self.prusa_origin['x']:.3f}, y={self.prusa_origin['y']:.3f}\n")

        # If using taught position, find first weld point and add KRL to read $POS_ACT
        if self.use_taught_position:
            self.find_first_weld_point()
            if self.first_weld_point:
                safety_delay = TAUGHT_START_SAFETY_DELAY
                k.append("; TAUGHT START POSITION MODE ENABLED\n")
                k.append("; Robot will read current position at startup as substrate origin\n")
                k.append("; X, Y and Z coordinates are offset\n")
                k.append("; Jog robot to desired starting point before running this program\n\n")
                k.append("; Read current robot position as taught starting point\n")
                k.append("TAUGHT_START = $POS_ACT\n\n")
                k.append("; First motion must be PTP to satisfy KUKA controller requirement\n")
                k.append("; Moving to taught position (already there, but satisfies KSS01443)\n")
                k.append("PTP TAUGHT_START\n\n")
                k.append(f"; SAFETY DELAY - {safety_delay:.1f} seconds before starting weld process\n")
                k.append("; This allows operator to verify position and move to safety\n")
                k.append(f"WAIT SEC {safety_delay:.1f}\n\n")
                k.append(f"; First weld point offset from taught position: X=0.000, Y=0.000 (Z is absolute)\n\n")
            else:
                k.append("; Warning: No weld points found, taught position mode disabled\n")
                self.use_taught_position = False
        
        # Add weaving info to header comments
        if WAAM_PARAMS.get('weaving_enabled', False):
            k.append(f"; Weaving enabled: amplitude={WAAM_PARAMS.get('weaving_amplitude', 2.0)}mm, ")
            k.append(f"frequency={WAAM_PARAMS.get('weaving_frequency', 2.0)}/mm\n")
        
        # Add welding strategy info
        welding_strategy = WAAM_PARAMS.get('welding_strategy', 'alternating').lower()
        travel_z_lift = WAAM_PARAMS.get('travel_z_lift', 5.0)
        travel_stabilization_delay = WAAM_PARAMS.get('travel_stabilization_delay', 5.0)
        if welding_strategy == 'unidirectional':
            k.append("; Welding strategy: UNIDIRECTIONAL (A->B, travel back, A->B...)\n")
        else:
            k.append("; Welding strategy: ALTERNATING (A->B, B->A, A->B...)\n")
        
        # Add travel Z-lift info
        if travel_z_lift > 0:
            k.append(f"; Travel Z-lift: {travel_z_lift:.1f}mm (prevents scratching welded beads)\n")
        if travel_stabilization_delay > 0:
            k.append(f"; Travel stabilization delay: {travel_stabilization_delay:.1f}s (wait after travel before Z lowers)\n")

        torch_out = WAAM_PARAMS.get('torch_output', 1)
        inter_delay = WAAM_PARAMS.get('inter_layer_delay', 10.0)
        pre_flow = WAAM_PARAMS.get('pre_flow', 0.2)
        post_flow = WAAM_PARAMS.get('post_flow', 0.2)
        blend_within = WAAM_PARAMS.get('blend_within_bead', True)

        last_emitted_pos = None

        def emit_lin(x: float, y: float, z: float, continue_motion: bool = False):
            nonlocal last_emitted_pos
            pos_tuple = (round(x, 6), round(y, 6), round(z, 6))
            if last_emitted_pos == pos_tuple:
                return
            pos = self.format_pos(x, y, z)
            
            if self.use_taught_position:
                # In taught mode, add X,Y,Z offset to TAUGHT_START
                k.append(f"OFFSET_POS = {pos}\n")
                k.append(f"TARGET_POS = TAUGHT_START\n")
                k.append(f"TARGET_POS.X = TAUGHT_START.X + OFFSET_POS.X\n")
                k.append(f"TARGET_POS.Y = TAUGHT_START.Y + OFFSET_POS.Y\n")
                k.append(f"TARGET_POS.Z = TAUGHT_START.Z + OFFSET_POS.Z\n")  
                k.append(f"TARGET_POS.A = TAUGHT_START.A\n")
                k.append(f"TARGET_POS.B = TAUGHT_START.B\n")
                k.append(f"TARGET_POS.C = TAUGHT_START.C\n")
                if continue_motion:
                    k.append(f"LIN TARGET_POS C_DIS\nCONTINUE\n")
                else:
                    k.append(f"LIN TARGET_POS C_DIS\n")
            else:
                # Normal mode, use absolute positions
                if continue_motion:
                    k.append(f"LIN {pos} C_DIS\nCONTINUE\n")
                else:
                    k.append(f"LIN {pos} C_DIS\n")
            
            last_emitted_pos = pos_tuple

        flip_next = False
        unidirectional_start_ref = None  # Track reference start point for unidirectional mode
        
        for layer_idx, layer_points in enumerate(layers):
            start_index = 0
            if layer_points and layer_points[0].raw_line and (layer_points[0].raw_line.startswith(';LAYER_CHANGE') or layer_points[0].raw_line.startswith(';Z:')):
                k.append(f"; {layer_points[0].raw_line.strip()}\n")
                k.append("; Reset TEMP_VAR at the start of this layer\n")
                k.append("TEMP_VAR = FALSE\n")
                start_index = 1

            segments = []
            i = start_index
            n = len(layer_points)
            while i < n:
                while i < n and not layer_points[i].welding:
                    i += 1
                if i >= n:
                    break
                j = i
                while j < n and layer_points[j].welding:
                    j += 1
                segments.append(layer_points[i:j])
                i = j

            for seg in segments:
                if not seg:
                    continue
                
                # Apply welding strategy
                if welding_strategy == 'unidirectional':
                    # Unidirectional: always weld in same direction (A to B)
                    # For first segment, set reference and use as-is
                    if unidirectional_start_ref is None:
                        unidirectional_start_ref = (seg[0].x, seg[0].y)
                        emitted = list(seg)
                        original_start = seg[0]
                    else:
                        # For subsequent segments, check if we need to reverse
                        # to maintain same start position (in X,Y)
                        dist_to_start = math.sqrt((seg[0].x - unidirectional_start_ref[0])**2 + 
                                                   (seg[0].y - unidirectional_start_ref[1])**2)
                        dist_to_end = math.sqrt((seg[-1].x - unidirectional_start_ref[0])**2 + 
                                                 (seg[-1].y - unidirectional_start_ref[1])**2)
                        
                        # If end is closer to reference start than beginning, reverse segment
                        if dist_to_end < dist_to_start:
                            emitted = list(reversed(seg))
                            original_start = seg[-1]  # Original start is now the last point
                        else:
                            emitted = list(seg)
                            original_start = seg[0]
                else:
                    # Alternating/zigzag: reverse every other segment to reduce travel
                    emitted = list(reversed(seg)) if flip_next else list(seg)
                    original_start = None

                # Move to start point (blocking LIN)
                start_pt = emitted[0]
                emit_lin(start_pt.x, start_pt.y, start_pt.z, continue_motion=False)

                # Torch on and pre-flow dwell
                k.append(f"$OUT[{torch_out}] = TRUE\n")
                if pre_flow and pre_flow > 0:
                    k.append(f"WAIT SEC {pre_flow:.3f}\n")

                # Generate weaved path through all points in segment
                for idx in range(len(emitted) - 1):
                    p1 = emitted[idx]
                    p2 = emitted[idx + 1]
                    
                    # Get weave points between p1 and p2
                    weave_coords = self.generate_weave_points(p1, p2)
                    
                    # Emit all weave points
                    for wc_idx, (wx, wy, wz) in enumerate(weave_coords):
                        is_last_in_segment = (idx == len(emitted) - 2) and (wc_idx == len(weave_coords) - 1)
                        # Use CONTINUE for all intermediate points, blocking LIN for last point
                        emit_lin(wx, wy, wz, continue_motion=(blend_within and not is_last_in_segment))

                # Torch off after motion completes
                k.append(f"$OUT[{torch_out}] = FALSE\n")
                if post_flow and post_flow > 0:
                    k.append(f"WAIT SEC {post_flow:.3f}\n")

                # Lift Z to avoid scratching welded bead during travel
                if travel_z_lift > 0:
                    k.append(f"; Lift Z by {travel_z_lift:.1f}mm to avoid scratching welded bead\n")
                    k.append(f"LIN_REL {{Z {travel_z_lift:.1f}}}\n")

                # Unidirectional strategy: travel back to original start point
                if welding_strategy == 'unidirectional' and original_start:
                    k.append("; Travel back to start for unidirectional strategy\n")
                    # Travel at lifted height (original_z + lift) to stay clear of welded bead
                    travel_z = original_start.z + travel_z_lift if travel_z_lift > 0 else original_start.z
                    emit_lin(original_start.x, original_start.y, travel_z, continue_motion=False)

                # Stabilization delay - wait for travel motion to fully complete before lowering Z
                if travel_z_lift > 0 and travel_stabilization_delay > 0:
                    k.append(f"; Stabilization delay - ensures travel motion completes before Z lowers\n")
                    k.append(f"WAIT SEC {travel_stabilization_delay:.1f}\n")

                 # Inter-layer delay
                # if inter_delay and inter_delay > 0:
                #     k.append(f"WAIT SEC {inter_delay:.2f}\n")
                #new inter-layer delay based on time or temp variable
                delay_type = WAAM_PARAMS.get('delay_type', 'time').lower()
                if delay_type == 'temp':
                    k.append(";Waiting for TEMP_VAR to go high indicating temperature reached before next layer\n")
                    k.append(f"WAIT SEC 30\n")  # Initial wait to allow temp to start rising 
                    k.append("WAIT FOR TEMP_VAR\n")
                    k.append(f"WAIT SEC 30\n")  # this wait will be removed, for now it just allows us to record the progress before each layer
                elif inter_delay and inter_delay > 0:
                    k.append(f"WAIT SEC {inter_delay:.2f}\n")

                # Lower Z back to weld height after travel
                if travel_z_lift > 0:
                    k.append(f"; Lower Z back to weld height\n")
                    k.append(f"LIN_REL {{Z -{travel_z_lift:.1f}}}\n")

               

                # Only flip for alternating strategy
                if welding_strategy != 'unidirectional':
                    flip_next = not flip_next

        footer = FOOTER_SRC.format(default_travel_speed=ROBOT_SPECS.get('default_travel_speed', 0.005))
        k.append(footer)
        return ''.join(k)

    def write(self, src_path: str, dat_path: str, program_name: str = "WAAM_PART"):
        krl = self.generate_krl(program_name)
        with open(src_path, 'w', encoding='utf-8') as f:
            f.write(krl)
        # Write minimal dat
        dat = HEADER_DAT.format(program_name=program_name)
        with open(dat_path, 'w', encoding='utf-8') as f:
            f.write(dat)


def main():
    if len(sys.argv) < 2:
        print('Usage: g_k_transpiler_tuned.py input_cleaned.gcode [program_name]')
        sys.exit(1)
    gfile = sys.argv[1]
    program_name = sys.argv[2] if len(sys.argv) >= 3 else Path(gfile).stem.upper()
    with open(gfile, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    t = TunedTranspiler()
    t.parse_gcode(lines)
    out_src = Path(gfile).with_suffix('.src')
    out_dat = Path(gfile).with_suffix('.dat')
    t.write(str(out_src), str(out_dat), program_name=program_name)
    print(f'Wrote: {out_src} and {out_dat}')



if __name__ == '__main__':
    main()