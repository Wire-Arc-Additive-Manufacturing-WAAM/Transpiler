#!/usr/bin/env python3
"""
visualize_toolpath.py

Simple `.src` KRL visualizer with optional animation.

Usage:
  python visualize_toolpath.py input.src        # open interactive 3D animation (matplotlib)
  python visualize_toolpath.py input.src --info # just print parsing summary and exit

Dependencies: matplotlib

The parser looks for `LIN {X ..., Y ..., Z ...}` lines and `$OUT[n] = TRUE/FALSE` torch toggles.
LIN positions are emitted sequentially and the current torch state is applied to subsequent LINs.
"""
import re
import sys
from pathlib import Path
import argparse
import math

try:
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
    from matplotlib.animation import FuncAnimation
except Exception as e:
    plt = None


LIN_RE = re.compile(r'LIN\s*\{([^}]*)\}', re.IGNORECASE)
OUT_RE = re.compile(r'\$OUT\s*\[\s*(\d+)\s*\]\s*=\s*(TRUE|FALSE)', re.IGNORECASE)
COORD_RE = re.compile(r'([XYZ])\s*([-+]?[0-9]*\.?[0-9]+)')


def parse_src(path):
    """Parse a .src file and return positions list and torch states.

    Returns:
      positions: list of (x,y,z) floats
      torch_states: list of booleans (state associated with that LIN)
      events: list of dicts with parsed event info for debug
    """
    pos = []
    torch = []
    events = []
    cur_torch = False
    with open(path, 'r') as f:
        for ln in f:
            l = ln.strip()
            if not l:
                continue
            m_out = OUT_RE.search(l)
            if m_out:
                val = m_out.group(2).upper()
                cur_torch = (val == 'TRUE')
                events.append({'type': 'torch', 'state': cur_torch, 'line': l})
                continue
            m = LIN_RE.search(l)
            if m:
                inside = m.group(1)
                coords = { 'X': None, 'Y': None, 'Z': None }
                for cm in COORD_RE.finditer(inside):
                    coords[cm.group(1).upper()] = float(cm.group(2))
                if coords['X'] is None or coords['Y'] is None or coords['Z'] is None:
                    # try to parse alternative formatting
                    # skip incomplete LINs
                    events.append({'type': 'lin_incomplete', 'line': l})
                    continue
                pos.append((coords['X'], coords['Y'], coords['Z']))
                torch.append(bool(cur_torch))
                events.append({'type': 'lin', 'pos': pos[-1], 'torch': torch[-1], 'line': l})
                continue
            # we ignore other lines
    return pos, torch, events


def print_info(path):
    pos, torch, events = parse_src(path)
    total = len(pos)
    welds = sum(1 for t in torch if t)
    travels = total - welds
    layers = sum(1 for e in events if e.get('type') == 'lin' and ';LAYER_CHANGE' in e.get('line', ''))
    print(f'Parsed: {total} LIN positions')
    print(f'  Welding LINs: {welds}')
    print(f'  Travel LINs:  {travels}')
    print(f'  Torch toggles/events: {sum(1 for e in events if e.get("type")=="torch")}')
    return pos, torch


def animate_src(path, interval=50, trail=200, save_path: str = None, dpi: int = 150):
    if plt is None:
        print('matplotlib not available; install matplotlib to use animation mode')
        return
    positions, torch_states, _ = parse_src(path)
    if not positions:
        print('No LIN positions found in file.')
        return

    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    zs = [p[2] for p in positions]

    fig = plt.figure(figsize=(10, 7))
    ax = fig.add_subplot(111, projection='3d')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_zlabel('Z')
    ax.set_title(Path(path).name)

    # plot full path faintly, colored by torch state
    travel_x = [x for x, t in zip(xs, torch_states) if not t]
    travel_y = [y for y, t in zip(ys, torch_states) if not t]
    travel_z = [z for z, t in zip(zs, torch_states) if not t]
    weld_x = [x for x, t in zip(xs, torch_states) if t]
    weld_y = [y for y, t in zip(ys, torch_states) if t]
    weld_z = [z for z, t in zip(zs, torch_states) if t]

    if travel_x:
        ax.plot(travel_x, travel_y, travel_z, color='blue', alpha=0.25, linewidth=1, label='travel')
    if weld_x:
        ax.plot(weld_x, weld_y, weld_z, color='red', alpha=0.6, linewidth=2, label='weld')

    # current point marker and trail
    current_point, = ax.plot([xs[0]], [ys[0]], [zs[0]], marker='o', color='k', markersize=8)
    trail_line, = ax.plot([], [], [], color='orange', linewidth=2, alpha=0.9)

    ax.legend()

    N = len(xs)

    # autoscale view a bit
    pad = 10
    ax.set_xlim(min(xs)-pad, max(xs)+pad)
    ax.set_ylim(min(ys)-pad, max(ys)+pad)
    ax.set_zlim(min(zs)-pad, max(zs)+pad)

    paused = {'val': False}

    def on_press(event):
        if event.key == ' ':
            paused['val'] = not paused['val']

    fig.canvas.mpl_connect('key_press_event', on_press)

    def update(frame):
        if paused['val']:
            return current_point, trail_line
        idx = frame % N
        x = xs[idx]
        y = ys[idx]
        z = zs[idx]
        # update marker
        current_point.set_data([x], [y])
        current_point.set_3d_properties([z])
        # draw trail of previous points
        start = max(0, idx - trail)
        trail_line.set_data(xs[start:idx+1], ys[start:idx+1])
        trail_line.set_3d_properties(zs[start:idx+1])
        # color marker by torch state
        current_point.set_color('red' if torch_states[idx] else 'blue')
        return current_point, trail_line

    anim = FuncAnimation(fig, update, frames=range(0, N), interval=interval, blit=False, repeat=True)

    # optionally save animation
    if save_path:
        # choose writer: prefer ffmpeg (mp4) else fall back to Pillow (gif)
        try:
            writers = FuncAnimation.canvas.figure.canvas.manager.canvas.figure.canvas.manager
        except Exception:
            writers = None
        from matplotlib import animation
        available = animation.writers.list()
        fps = int(max(1, round(1000.0 / max(1, interval))))
        out_p = Path(save_path)
        if 'ffmpeg' in available:
            print(f'Saving animation to {out_p} using ffmpeg (mp4), fps={fps}...')
            writer = animation.writers['ffmpeg'](fps=fps)
            anim.save(str(out_p), writer=writer, dpi=dpi)
        else:
            # fallback to pillow -> GIF; ensure extension is .gif
            try:
                if out_p.suffix.lower() != '.gif':
                    out_p = out_p.with_suffix('.gif')
                print(f'ffmpeg not available, saving GIF to {out_p} using PillowWriter, fps={fps}...')
                writer = animation.PillowWriter(fps=fps)
                anim.save(str(out_p), writer=writer, dpi=dpi)
            except Exception as e:
                print('Failed to save animation:', e)

    print('Controls: space to pause/resume. Close window to exit.')
    plt.show()


def main():
    ap = argparse.ArgumentParser(description='Visualize KRL .src toolpath (LIN positions and torch state)')
    ap.add_argument('src', help='input .src file')
    ap.add_argument('--info', action='store_true', help='print parsing summary and exit')
    ap.add_argument('--interval', type=int, default=50, help='animation frame interval in ms')
    ap.add_argument('--trail', type=int, default=200, help='trail length in points')
    ap.add_argument('--save', help='optional output file to save animation (mp4 or gif)')
    ap.add_argument('--dpi', type=int, default=150, help='dpi for saved animation')
    args = ap.parse_args()

    path = Path(args.src)
    if not path.exists():
        print('File not found:', path)
        sys.exit(1)
    if args.info:
        print_info(path)
        return
    animate_src(path, interval=args.interval, trail=args.trail, save_path=args.save, dpi=args.dpi)


if __name__ == '__main__':
    main()
