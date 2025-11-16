#!/usr/bin/env python3

import socket
import time
import signal
import sys
from datetime import datetime

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    print("RPi.GPIO not available")
    GPIO_AVAILABLE = False

ROBOT_IP = '172.31.1.147'
KVP_TORCH_OUTPUT_VARIABLE = '$OUT[1]'  # KUKA output for torch control
RELAY_PIN = 5
TORCH_POLL_INTERVAL = 0.1  

# Relay polarity constants set only when GPIO is available
if GPIO_AVAILABLE:

    RELAY_ACTIVE = GPIO.HIGH
    RELAY_INACTIVE = GPIO.LOW
else:
    RELAY_ACTIVE = None
    RELAY_INACTIVE = None

last_torch_state = False  
consecutive_torch_failures = 0
running = True

client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)


def log_info(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[INFO] [{timestamp}] {message}")


def log_warn(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[WARN] [{timestamp}] {message}")


def log_error(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[ERROR] [{timestamp}] {message}", file=sys.stderr)


class KUKA(object):
    def __init__(self, TCP_IP):
        try:
            client.connect((TCP_IP, 7000))
            log_info(f"Connected to KUKA robot at {TCP_IP}:7000")
        except Exception as e:
            self.error_list(1, str(e))

    def send(self, var, val, msgID):
        try:
            msg = bytearray()
            temp = bytearray()
            if val != "":
                val = str(val)
                msg.append((len(val) & 0xff00) >> 8)
                msg.append((len(val) & 0x00ff))
                msg.extend(map(ord, val))
            temp.append(bool(val))
            temp.append(((len(var)) & 0xff00) >> 8)
            temp.append((len(var)) & 0x00ff)
            temp.extend(map(ord, var))
            msg = temp + msg
            del temp[:]
            temp.append((msgID & 0xff00) >> 8)
            temp.append(msgID & 0x00ff)
            temp.append((len(msg) & 0xff00) >> 8)
            temp.append((len(msg) & 0x00ff))
            msg = temp + msg
        except Exception as e:
            self.error_list(2, str(e))
        try:
            client.send(msg)
            return client.recv(1024)
        except Exception as e:
            self.error_list(1, str(e))

    def __get_var(self, msg):
        try:
            lsb = int(msg[5])
            msb = int(msg[6])
            lenValue = (lsb << 8 | msb)
            return str(msg[7: 7+lenValue], 'utf-8')
        except Exception as e:
            self.error_list(2, str(e))

    def read(self, var, msgID=0):
        try:
            return self.__get_var(self.send(var, "", msgID))
        except Exception as e:
            self.error_list(2, str(e))

    def write(self, var, val, msgID=0):
        try:
            if val != (""):
                return self.__get_var(self.send(var, val, msgID))
            else:
                raise ValueError("Variable value is not defined")
        except Exception as e:
            self.error_list(2, str(e))

    def disconnect(self):
        try:
            client.close()
            log_info("Disconnected from KUKA robot")
        except:
            pass

    def error_list(self, ID, error_msg=""):
        if ID == 1:
            log_error(f"TCP Network Error : {error_msg}")
            log_error("    Check your KRC's IP address.")
            self.disconnect()
            raise SystemExit
        elif ID == 2:
            log_error(f"Python Error: {error_msg}")
            self.disconnect()
            raise SystemExit
        elif ID == 3:
            log_error("    Variable value is not defined.")

def signal_handler(sig, frame):
    global running
    log_info("Shutdown signal received, stopping...")
    running = False


def torch_control_loop(robot):
    global last_torch_state, consecutive_torch_failures

    if not GPIO_AVAILABLE:
        return

    try:
        # Read torch output state from KUKA
        response = robot.read(KVP_TORCH_OUTPUT_VARIABLE)

        if response is None:
            consecutive_torch_failures += 1
            if consecutive_torch_failures >= 5:
                log_warn(f'Torch control: {consecutive_torch_failures} consecutive read failures')
            return

        # Reset failure counter on successful read
        consecutive_torch_failures = 0

        # Parse response ( "TRUE" or "FALSE" or "1"/"0")
        response_upper = response.upper().strip()
        current_state = response_upper in ["FALSE", "0", "#FALSE"]

        # Update relay if state changed
        if current_state != last_torch_state:
            GPIO.output(RELAY_PIN, RELAY_INACTIVE if current_state else RELAY_ACTIVE)
            status = "OFF" if current_state else "ON"
            log_info(f'Torch {status} (KUKA $OUT[1]: {response})')
            last_torch_state = current_state

    except Exception as e:
        log_error(f'Torch control error: {e}')
        consecutive_torch_failures += 1


def cleanup(robot):
    log_info("Performing cleanup...")

    # Safety: Turn off torch on shutdown 
    if GPIO_AVAILABLE:
        try:
            GPIO.output(RELAY_PIN, RELAY_INACTIVE)
            log_info("Torch turned OFF (safety shutdown)")
            try:
                GPIO.cleanup(RELAY_PIN)
            except Exception:
             
                GPIO.cleanup()
            log_info("GPIO cleanup completed")
        except Exception as e:
            log_error(f"GPIO cleanup error: {e}")

    robot.disconnect()


def main():
    global running, GPIO_AVAILABLE, last_torch_state, consecutive_torch_failures

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    log_info(" Torch Control Service Starting ")

    # Initialize GPIO if available
    if GPIO_AVAILABLE:
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            try:
                GPIO.cleanup(RELAY_PIN)
            except Exception:
                pass
            time.sleep(0.1)
            GPIO.setup(RELAY_PIN, GPIO.OUT, initial=RELAY_INACTIVE)
            log_info(f"GPIO pin {RELAY_PIN} initialized to INACTIVE - SAFE STATE")
        except Exception as e:
            log_error(f"GPIO setup failed: {e}")
            GPIO_AVAILABLE = False
    else:
        log_warn("GPIO torch control disabled")

    robot = KUKA(ROBOT_IP)

    log_info("Torch Control Service started successfully")
    if GPIO_AVAILABLE:
        log_info(f"GPIO torch control enabled on pin {RELAY_PIN}")

    try:
        while running:
            torch_control_loop(robot)
            time.sleep(TORCH_POLL_INTERVAL)

    except KeyboardInterrupt:
        log_info("Keyboard interrupt received")

    except Exception as e:
        log_error(f"Unexpected error in main loop: {e}")

    finally:
        cleanup(robot)
        log_info("Torch Control Service stopped cleanly")

if __name__ == '__main__':
    main()
