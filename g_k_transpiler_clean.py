
"""Torch on issues due to motion blending solved """

import os
import sys
import re
import json
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
WAAM_PARAMS = _cfg.get('waam_params', {
    'inter_layer_delay': 10.0,
    'min_extrusion_threshold': 0.01,
    'torch_output': 1,
    'apo_cdis': 0.25,
    'auto_prusa_origin': False,
    # NEW tuning parameters for motion + appropriate torch state transitions
    'pre_flow': 0.2,           
    'post_flow': 0.2,          
    'blend_within_bead': True,  
})

HEADER_SRC = """DEF {program_name}()
;FOLD INI
  ;FOLD BASISTECH INI
    BAS (#INITMOV,0)
  ;ENDFOLD (BASISTECH INI)
  ;FOLD USER INI
    ;WAAM-optimized initialization
  ;ENDFOLD (USER INI)
;ENDFOLD (INI)

BASE_DATA[8] = {{FRAME: X 168.4, Y -507.55, Z 688.59, A 179.6, B -1.15, C 0.29}}
TOOL_DATA[4] = {{FRAME: X -17.74, Y -37.22, Z 294.62, A 0, B 0, C 0}}
$BASE = BASE_DATA[8]
$TOOL = TOOL_DATA[4]

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
$ADVANCE = 1
$APO.CDIS = {apo_cdis:.2f}

PTP HOME

CONTINUE
$OUT[{torch_output}] = FALSE

;===========
; BEGIN WAAM PROCESS
;===========

"""

HEADER_DAT = """DEFDAT {program_name} PUBLIC
DECL E6POS HOME={{X -183.3,Y -17.4,Z 38.3,A 129.7,B -46.5,C 162.4,S 18,T 34}}
ENDDAT
"""

FOOTER_SRC = """
;===========
; WAAM PROCESS COMPLETE
;===========

$VEL.CP = {default_travel_speed:.4f}
LIN_REL {{Z 20}}
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

    def transform(self, x: float, y: float, z: float):
        x_b = self.prusa_origin.get('x', PRUSA_SLICER_ORIGIN.get('x', 0)) + x
        y_b = self.prusa_origin.get('y', PRUSA_SLICER_ORIGIN.get('y', 0)) + y
        z_b = self.prusa_origin.get('z', PRUSA_SLICER_ORIGIN.get('z', -2)) + z
        return x_b, y_b, z_b

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
                # determine absolute X of this movement for auto-origin
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
        # NOTE: auto prusa origin will be computed after per-layer welding detection

    def feed_to_velcp(self, f_mm_per_min: float) -> float:
        return max(0.0001, min(ROBOT_SPECS.get('max_tcp_speed', 0.3), f_mm_per_min / 60000.0))

    def format_pos(self, x: float, y: float, z: float) -> str:
        xb, yb, zb = self.transform(x, y, z)
        return f"{{X {xb:.3f}, Y {yb:.3f}, Z {zb:.3f}, A 129.7, B -46.5, C 162.4}}"

    def generate_krl(self, program_name: str = "WAAM_PART") -> str:
        k = []
        header = HEADER_SRC.format(
            program_name=program_name,
            default_travel_speed=ROBOT_SPECS.get('default_travel_speed', 0.005),
            apo_cdis=WAAM_PARAMS.get('apo_cdis', 0.25),
            torch_output=WAAM_PARAMS.get('torch_output', 1)
        )
        k.append(header)
      
        layers = []
        current_layer: List[Point] = []
        for p in self.points:
            if p.raw_line and (p.raw_line.startswith(';LAYER_CHANGE') or p.raw_line.startswith(';Z:')):
                # finish current layer and start a new one, keep marker as first element
                if current_layer:
                    layers.append(current_layer)
                current_layer = [p]
            else:
                current_layer.append(p)
        if current_layer:
            layers.append(current_layer)

        # refine welding detection per-layer based on E deltas - mark previous point too
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

        if WAAM_PARAMS.get('auto_prusa_origin', False):
            first_weld = None
            for p in self.points:
                if p.welding:
                    first_weld = p
                    break
            if first_weld:
                self.prusa_origin['x'] = -first_weld.x
                self.prusa_origin['y'] = -first_weld.y
                k.append(f"; Auto prusa origin applied: x={self.prusa_origin['x']:.3f}, y={self.prusa_origin['y']:.3f}\n")

        torch_out = WAAM_PARAMS.get('torch_output', 1)
        inter_delay = WAAM_PARAMS.get('inter_layer_delay', 10.0)
        pre_flow = WAAM_PARAMS.get('pre_flow', 0.2)
        post_flow = WAAM_PARAMS.get('post_flow', 0.2)
        blend_within = WAAM_PARAMS.get('blend_within_bead', True)

        last_emitted_pos = None

        def emit_lin(pt: Point, continue_motion: bool = False):
            nonlocal last_emitted_pos
            pos_tuple = (round(pt.x, 6), round(pt.y, 6), round(pt.z, 6))
            if last_emitted_pos == pos_tuple:
                return
            pos = self.format_pos(pt.x, pt.y, pt.z)
            if continue_motion:
                k.append(f"LIN {pos} C_DIS\nCONTINUE\n")
            else:
                k.append(f"LIN {pos} C_DIS\n")
            last_emitted_pos = pos_tuple

        flip_next = False
        for layer_idx, layer_points in enumerate(layers):
            start_index = 0
            if layer_points and layer_points[0].raw_line and (layer_points[0].raw_line.startswith(';LAYER_CHANGE') or layer_points[0].raw_line.startswith(';Z:')):
                k.append(f"; {layer_points[0].raw_line.strip()}\n")
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
                # reversing alternating segments to reduce travel
                emitted = list(reversed(seg)) if flip_next else list(seg)

               #  blocking LIN (no CONTINUE) to ensure stop at start point
                start_pt = emitted[0]
                emit_lin(start_pt, continue_motion=False)

                # Torch on and pre flow dwell
                k.append(f"$OUT[{torch_out}] = TRUE\n")
                if pre_flow and pre_flow > 0:
                    k.append(f"WAIT SEC {pre_flow:.3f}\n")

               
                 # emit CONTINUE after each intermediate point, but make the LAST point a blocking LIN
                m = len(emitted)
                for idx, wp in enumerate(emitted):
                   
                    if idx == 0:
                        continue
                    is_last = (idx == m-1)
                    # use CONTINUE for intermediate points when blending is desired
                    emit_lin(wp, continue_motion=(blend_within and not is_last))

                #  ensure motion has completed before turning torch off
                # The last emitted LIN was blocking (continue_motion=False) so we are safe to toggle
                k.append(f"$OUT[{torch_out}] = FALSE\n")
                if post_flow and post_flow > 0:
                    k.append(f"WAIT SEC {post_flow:.3f}\n")

              #   inter-layer delay (if this segment ended a layer)
                if inter_delay and inter_delay > 0:
                    k.append(f"WAIT SEC {inter_delay:.2f}\n")

                flip_next = not flip_next

        footer = FOOTER_SRC.format(default_travel_speed=ROBOT_SPECS.get('default_travel_speed', 0.005))
        k.append(footer)
        return ''.join(k)

    def write(self, src_path: str, dat_path: str, program_name: str = "WAAM_PART"):
        krl = self.generate_krl(program_name)
        with open(src_path, 'w') as f:
            f.write(krl)
        # write a minimal dat
        dat = HEADER_DAT.format(program_name=program_name)
        with open(dat_path, 'w') as f:
            f.write(dat)


def main():
    if len(sys.argv) < 2:
        print('Usage: g_k_transpiler_tuned.py input_cleaned.gcode [program_name]')
        sys.exit(1)
    gfile = sys.argv[1]
    program_name = sys.argv[2] if len(sys.argv) >= 3 else Path(gfile).stem.upper()
    with open(gfile, 'r') as f:
        lines = f.readlines()
    t = TunedTranspiler()
    t.parse_gcode(lines)
    out_src = Path(gfile).with_suffix('.src')
    out_dat = Path(gfile).with_suffix('.dat')
    t.write(str(out_src), str(out_dat), program_name=program_name)
    print(f'Wrote: {out_src} and {out_dat}')


if __name__ == '__main__':
    main()

