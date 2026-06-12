import asyncio
import json
import os
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pymodbus.client import AsyncModbusSerialClient

try:
    import RPi.GPIO as GPIO 
except Exception:
    GPIO = None


SERIAL_PORT = os.getenv("PYRO_SERIAL_PORT", "/dev/ttyUSB0")
BAUDRATE = int(os.getenv("PYRO_BAUDRATE", "9600"))
SLAVE_ID = int(os.getenv("PYRO_SLAVE_ID", "1"))
TEMP_REGISTER = int(os.getenv("PYRO_TEMP_REGISTER", "0"))
POLL_SEC = float(os.getenv("PYRO_POLL_SEC", "0.1"))
GPIO_PIN = int(os.getenv("PYRO_TORCH_GPIO_PIN", "24"))
GPIO_POLL_SEC = float(os.getenv("PYRO_GPIO_POLL_SEC", "0.02"))
LOG_FILE = Path(os.getenv("PYRO_LOG_FILE", "weld_pool_temperature_log.jsonl"))

app = FastAPI(title="WAAM Pyrometer Gateway")
app.mount("/static", StaticFiles(directory="static"), name="static")

latest = {
    "timestamp": None,
    "temperature_c": None,
    "arc_on": False,
    "valid": False,
}
ws_clients = set()
modbus_client: Optional[AsyncModbusSerialClient] = None


def _guess_primary_ipv4() -> Optional[str]:
    """Best-effort LAN address used for default outbound traffic (no packets sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("203.0.113.1", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def _print_listen_hints(port: int) -> None:
    host = socket.gethostname()
    ip = _guess_primary_ipv4()
    print("Pyrometer UI (bookmark one that works on your network):")
    print(f"  http://127.0.0.1:{port}/")
    print(f"  http://{host}.local:{port}/   # mDNS if Avahi is running on the Pi")
    if ip:
        print(f"  http://{ip}:{port}/")


async def broadcast(payload: dict) -> None:
    dead = []
    message = json.dumps(payload)
    for ws in ws_clients:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


async def poll_pyrometer() -> None:
    global modbus_client
    while True:
        try:
            if modbus_client is None:
                modbus_client = AsyncModbusSerialClient(
                    port=SERIAL_PORT,
                    baudrate=BAUDRATE,
                    bytesize=8,
                    parity="N",
                    stopbits=1,
                    timeout=1,
                )
                await modbus_client.connect()

            rr = await modbus_client.read_holding_registers(
                address=TEMP_REGISTER,
                count=1,
                device_id=SLAVE_ID,
            )

            if rr.isError():
                latest["valid"] = False
            else:
                raw_value = rr.registers[0]
                latest["temperature_c"] = raw_value / 10.0
                latest["timestamp"] = datetime.now(timezone.utc).isoformat()
                latest["valid"] = True

                if latest["arc_on"]:
                    with LOG_FILE.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(latest) + "\n")

            await broadcast(latest)
        except Exception:
            latest["valid"] = False
            await broadcast(latest)
        await asyncio.sleep(POLL_SEC)


async def monitor_torch_gpio() -> None:
    if GPIO is None:
        return

    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(GPIO_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
    previous = None

    try:
        while True:
            state = bool(GPIO.input(GPIO_PIN))
            if state != previous:
                latest["arc_on"] = state
                previous = state
                await broadcast(latest)
            await asyncio.sleep(GPIO_POLL_SEC)
    finally:
        GPIO.cleanup(GPIO_PIN)


@app.on_event("startup")
async def startup_event() -> None:
    hint_port = int(os.getenv("PYRO_LISTEN_HINT_PORT", "8000"))
    _print_listen_hints(hint_port)
    asyncio.create_task(poll_pyrometer())
    asyncio.create_task(monitor_torch_gpio())


@app.get("/")
async def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/api/latest")
async def get_latest() -> dict:
    return latest


@app.websocket("/ws")
async def ws_endpoint(websocket) -> None:
    await websocket.accept()
    ws_clients.add(websocket)
    await websocket.send_text(json.dumps(latest))
    try:
        while True:
            # Keep the websocket open; incoming messages are ignored.
            await websocket.receive_text()
    except Exception:
        ws_clients.discard(websocket)
