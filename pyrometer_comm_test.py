#!/usr/bin/env python3
"""
Quick RS485 communication test for WAAM pyrometer.

Usage examples:
  python3 pyrometer_comm_test.py
  python3 pyrometer_comm_test.py --port /dev/ttyUSB0 --reads 10
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import time

from pymodbus.client import ModbusSerialClient
from pymodbus.exceptions import ModbusIOException
from pymodbus.framer import FramerType


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check if pyrometer responds over USB-RS485 Modbus RTU."
    )
    parser.add_argument("--port", default="/dev/ttyUSB0", help="Serial port path.")
    parser.add_argument("--baudrate", type=int, default=9600, help="Modbus baudrate.")
    parser.add_argument("--slave", type=int, default=1, help="Modbus slave ID.")
    parser.add_argument(
        "--register",
        type=int,
        default=0,
        help="Holding register address for temperature.",
    )
    parser.add_argument("--reads", type=int, default=5, help="Number of reads to run.")
    parser.add_argument(
        "--interval",
        type=float,
        default=0.5,
        help="Seconds between reads.",
    )
    parser.add_argument("--timeout", type=float, default=1.0, help="Serial timeout.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    candidates = sorted(
        set(
            glob.glob("/dev/ttyUSB*")
            + glob.glob("/dev/ttyACM*")
            + glob.glob("/dev/serial/by-id/*")
        )
    )

    client = ModbusSerialClient(
        framer=FramerType.RTU,
        port=args.port,
        baudrate=args.baudrate,
        bytesize=8,
        parity="N",
        stopbits=1,
        timeout=args.timeout,
        retries=3,
    )

    print("Opening serial port...")
    if not client.connect():
        print(f"FAIL: Could not open {args.port}")
        print("Check USB-RS485 adapter connection and selected port.")
        if candidates:
            print("\nDetected serial devices on this machine:")
            for c in candidates:
                print(f" - {c}")
        else:
            print("\nNo /dev/ttyUSB*, /dev/ttyACM*, or /dev/serial/by-id devices found.")
            if os.path.exists("/dev"):
                print("If you are on a Raspberry Pi, plug in the adapter and re-run.")
        return 2

    print(
        f"Connected to {args.port}. Reading slave={args.slave} register={args.register} "
        f"({args.reads} tries)..."
    )

    success_count = 0
    io_failures = 0
    try:
        for i in range(1, args.reads + 1):
            try:
                rr = client.read_holding_registers(
                    address=args.register,
                    count=1,
                    device_id=args.slave,
                )
            except ModbusIOException as e:
                io_failures += 1
                print(f"[{i}/{args.reads}] I/O timeout/no response: {e}")
                if i < args.reads:
                    time.sleep(args.interval)
                continue

            if rr.isError():
                print(f"[{i}/{args.reads}] No valid reply (Modbus error): {rr}")
            else:
                raw = rr.registers[0]
                temp_c = raw / 10.0
                success_count += 1
                print(f"[{i}/{args.reads}] OK raw={raw} -> temperature={temp_c:.1f} C")

            if i < args.reads:
                time.sleep(args.interval)
    finally:
        client.close()
        print("Serial port closed.")

    if success_count == 0:
        print("\nRESULT: FAIL (no valid responses)")
        if io_failures:
            print(f"Observed {io_failures} read attempts with no response/timeouts.")
        print("Try these checks:")
        print(" - Swap A/B wires (blue/orange).")
        print(" - Confirm pyrometer has 24V power.")
        print(" - Confirm 120 ohm termination only where needed.")
        print(" - Confirm slave ID, baudrate, and register.")
        return 1

    print(f"\nRESULT: PASS ({success_count}/{args.reads} successful reads)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
