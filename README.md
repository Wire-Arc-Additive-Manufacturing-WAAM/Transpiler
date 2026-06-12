# Pyrometer RS485 Quick Start

This project reads a WAAM pyrometer over USB-to-RS485 using Modbus RTU.

For full details, see `WAAM_pyrometer_setup.md`.

## Wiring Schematic

```text
                 24V DC SUPPLY
             +--------------------+
             |                    |
      +24V --+----[0.5A fuse]-----+------------------> Pyrometer +V
       0V ---+---------------------+------------------> Pyrometer Black (0V/Common -)
             |
             |                         USB
             |                    +-------------+
             +--------------------| Raspberry Pi|
                                  +-------------+
                                         |
                                   USB-to-RS485
                                 +----------------+
                                 |  A(+)   B(-)   |
                                 |   |      |     |
                                 +---|------|-----+
                                     |      |
                                     |      +------------------> Pyrometer Orange (B-)
                                     +-------------------------> Pyrometer Blue (A+)

                              [120 ohm termination resistor]
                               between A(+) and B(-) at bus end
                               (usually near pyrometer)
```

## Connection Notes

- Blue wire is RS485 `A+`.
- Orange wire is RS485 `B-`.
- Black wire is 0V/common negative.
- Connect USB-RS485 signal ground/common to pyrometer black/common for a stable reference.
- Use one 120 ohm termination across A/B at the end of the RS485 line.

## Sensor Comms Test

After wiring and power-up, run:

```bash
python3 pyrometer_comm_test.py --port /dev/ttyUSB0
```

If it fails, first try swapping A/B lines and re-run the test.
