import os
import sys
import subprocess
import threading
import time
import signal

# ANSI Color escape sequences
COLOR_BACKEND = "\033[96m"   # Cyan
COLOR_FRONTEND = "\033[93m"  # Yellow
COLOR_EDGE = "\033[92m"      # Green
COLOR_SYSTEM = "\033[95m"    # Magenta
COLOR_RESET = "\033[0m"

processes = []
shutdown_triggered = False

def log_streamer(pipe, prefix, color):
    """Reads lines from a subprocess pipe and prints them with a color prefix."""
    try:
        for line in iter(pipe.readline, ''):
            clean_line = line.strip()
            if clean_line:
                print(f"{color}{prefix}{COLOR_RESET} {clean_line}")
                sys.stdout.flush()
    except Exception:
        pass

def launch_process(command, cwd, prefix, color):
    """Launches a background process, capturing and streaming output in a thread."""
    global processes
    print(f"{COLOR_SYSTEM}[SYSTEM] Booting {prefix} inside '{cwd}'...{COLOR_RESET}")
    
    # Run with shell=True and text=True to cleanly stream string lines
    proc = subprocess.Popen(
        command,
        cwd=cwd,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append((prefix, proc))
    
    # Thread to stream stdout/stderr in real-time
    t = threading.Thread(target=log_streamer, args=(proc.stdout, prefix, color), daemon=True)
    t.start()
    return proc

def trigger_edge_simulation():
    """Waits 5 seconds, then launches the short-lived Edge CV telemetry trigger."""
    global shutdown_triggered
    time.sleep(5)
    if shutdown_triggered:
        return
        
    cmd = "python backend/demo_trigger.py --gate 3 --density 45"
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    launch_process(cmd, root_dir, "[EDGE-CV]", COLOR_EDGE)

def graceful_shutdown(signum=None, frame=None):
    """Terminates all active processes and cleanly closes ports."""
    global processes, shutdown_triggered
    if shutdown_triggered:
        return
    shutdown_triggered = True
    
    print(f"\n{COLOR_SYSTEM}[SYSTEM] Initiating clean shutdown of all systems...{COLOR_RESET}")
    
    for prefix, proc in processes:
        if proc.poll() is None:
            print(f"{COLOR_SYSTEM}[SYSTEM] Stopping {prefix} (PID: {proc.pid})...{COLOR_RESET}")
            # On Windows, taskkill is used to terminate subprocess tree; on Unix, SIGTERM works
            if os.name == 'nt':
                subprocess.run(f"taskkill /F /T /PID {proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                proc.terminate()
                proc.wait(timeout=2)
                
    print(f"{COLOR_SYSTEM}[SYSTEM] Operations closed cleanly. No rogue ports left open.{COLOR_RESET}")
    sys.exit(0)

def main():
    # Setup Ctrl+C signal handlers
    signal.signal(signal.SIGINT, graceful_shutdown)
    if os.name != 'nt':
        signal.signal(signal.SIGTERM, graceful_shutdown)
        
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")
    
    # Enable ANSI terminal coloring on Windows Command Prompts
    if os.name == 'nt':
        os.system('color')

    print(f"{COLOR_SYSTEM}===================================================================={COLOR_RESET}")
    print(f"{COLOR_SYSTEM}      ASTRACROWD AI OPERATIONS CENTER ORCHESTRATION TERMINAL        {COLOR_RESET}")
    print(f"{COLOR_SYSTEM}===================================================================={COLOR_RESET}")
    print(f"{COLOR_SYSTEM}[SYSTEM] Press Ctrl+C at any time to terminate the entire stack cleanly.{COLOR_RESET}\n")

    # 1. Environment 1: FastAPI Backend
    backend_cmd = "uvicorn main:app --host 0.0.0.0 --port 8000"
    launch_process(backend_cmd, backend_dir, "[BACKEND]", COLOR_BACKEND)

    # 2. Environment 2: Vite Frontend PWA
    frontend_cmd = "npm run dev"
    launch_process(frontend_cmd, frontend_dir, "[FRONTEND]", COLOR_FRONTEND)

    # 3. Environment 3: Edge CV Simulation Trigger (Async Thread after 5 seconds)
    edge_thread = threading.Thread(target=trigger_edge_simulation, daemon=True)
    edge_thread.start()

    # Keep main thread alive monitoring subprocesses
    try:
        while True:
            time.sleep(1)
            # Check if critical systems crashed
            for prefix, proc in processes:
                if prefix in ["[BACKEND]", "[FRONTEND]"] and proc.poll() is not None:
                    print(f"{COLOR_SYSTEM}[SYSTEM] Critical Failure: {prefix} exited unexpectedly with code {proc.returncode}.{COLOR_RESET}")
                    graceful_shutdown()
    except KeyboardInterrupt:
        graceful_shutdown()

if __name__ == "__main__":
    main()
