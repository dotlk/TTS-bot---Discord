
import os
import sys
import time
import queue
import shutil
import threading
import subprocess
import tkinter as tk
from pathlib import Path
from tkinter import ttk, scrolledtext, messagebox
from urllib.request import urlopen

ROOT = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent.parent
)
XTTS_DIR = ROOT / "xtts-service"
HEALTH_URL = "http://127.0.0.1:8000/health"

HEALTH_TIMEOUT = 180
HEALTH_INTERVAL = 2


class UrielLauncher:
    def __init__(self, root):
        self.root = root
        self.root.title("Uriel Bot Launcher")
        self.root.geometry("850x600")
        self.root.minsize(700, 450)

        self.xtts_process = None
        self.discord_process = None

        self.events = queue.Queue()
        self.stopping = threading.Event()
        self.starting = set()
        self.closing = False

        self.xtts_status = tk.StringVar(value="Offline")
        self.discord_status = tk.StringVar(value="Offline")

        self.build_interface()

        self.root.after(100, self.process_events)
        self.root.after(1000, self.monitor_processes)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def build_interface(self):
        self.root.configure(bg="#16191f")

        style = ttk.Style()
        style.theme_use("clam")

        style.configure(
            "TNotebook",
            background="#16191f",
            borderwidth=0
        )
        style.configure(
            "TNotebook.Tab",
            background="#252a34",
            foreground="#ffffff",
            padding=(16, 8)
        )
        style.map(
            "TNotebook.Tab",
            background=[("selected", "#384355")]
        )

        container = tk.Frame(self.root, bg="#16191f")
        container.pack(fill="both", expand=True, padx=20, pady=20)

        title = tk.Label(
            container,
            text="URIEL BOT",
            font=("Segoe UI", 22, "bold"),
            bg="#16191f",
            fg="#ffffff"
        )
        title.pack(anchor="w")

        subtitle = tk.Label(
            container,
            text="Discord TTS • Service Manager",
            font=("Segoe UI", 10),
            bg="#16191f",
            fg="#9ca3af"
        )
        subtitle.pack(anchor="w", pady=(0, 20))

        status_frame = tk.Frame(container, bg="#252a34")
        status_frame.pack(fill="x", pady=(0, 16))

        self.create_status_row(
            status_frame,
            "Discord Bot",
            self.discord_status
        )

        self.create_status_row(
            status_frame,
            "XTTS2 Service",
            self.xtts_status
        )

        controls = tk.Frame(container, bg="#16191f")
        controls.pack(fill="x", pady=(0, 16))

        self.start_bot_button = tk.Button(
            controls,
            text="▶  Start Bot",
            command=self.start_bot,
            bg="#23865c",
            fg="white",
            activebackground="#2da874",
            activeforeground="white",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=22,
            pady=10,
            cursor="hand2"
        )
        self.start_bot_button.pack(side="left", padx=(0, 10))

        self.start_xtts_button = tk.Button(
            controls,
            text="▶  Start XTTS2",
            command=self.start_xtts,
            bg="#23865c",
            fg="white",
            activebackground="#2da874",
            activeforeground="white",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=22,
            pady=10,
            cursor="hand2"
        )
        self.start_xtts_button.pack(side="left", padx=(0, 10))

        self.stop_button = tk.Button(
            controls,
            text="■  Stop All",
            command=self.stop_all,
            bg="#a63d46",
            fg="white",
            activebackground="#c44a55",
            activeforeground="white",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=22,
            pady=10,
            cursor="hand2"
        )
        self.stop_button.pack(side="left")

        self.clear_button = tk.Button(
            controls,
            text="Clear Logs",
            command=self.clear_logs,
            bg="#343b49",
            fg="white",
            activebackground="#475163",
            activeforeground="white",
            font=("Segoe UI", 10),
            relief="flat",
            padx=16,
            pady=11,
            cursor="hand2"
        )
        self.clear_button.pack(side="right")

        notebook = ttk.Notebook(container)
        notebook.pack(fill="both", expand=True)

        self.system_log = self.create_log_tab(notebook, "System")
        self.discord_log = self.create_log_tab(notebook, "Discord")
        self.xtts_log = self.create_log_tab(notebook, "XTTS2")

        self.log("system", "Uriel Bot Launcher iniciado.")
        self.log("system", f"Diretório: {ROOT}")

    def create_status_row(self, parent, name, variable):
        row = tk.Frame(parent, bg="#252a34")
        row.pack(fill="x", padx=16, pady=10)

        tk.Label(
            row,
            text=name,
            bg="#252a34",
            fg="#ffffff",
            font=("Segoe UI", 11, "bold")
        ).pack(side="left")

        label = tk.Label(
            row,
            textvariable=variable,
            bg="#252a34",
            fg="#9ca3af",
            font=("Segoe UI", 10)
        )
        label.pack(side="right")

        if name == "XTTS2 Service":
            self.xtts_status_label = label
        else:
            self.discord_status_label = label

    def create_log_tab(self, notebook, name):
        frame = tk.Frame(notebook, bg="#16191f")
        notebook.add(frame, text=name)

        log_widget = scrolledtext.ScrolledText(
            frame,
            bg="#101318",
            fg="#d1d5db",
            insertbackground="white",
            font=("Consolas", 10),
            relief="flat",
            wrap="word",
            state="disabled"
        )
        log_widget.pack(fill="both", expand=True, padx=2, pady=8)

        return log_widget

    def log(self, source, message):
        timestamp = time.strftime("%H:%M:%S")
        self.events.put(
            ("log", source, f"[{timestamp}] {message}")
        )

    def set_status(self, service, status):
        self.events.put(("status", service, status))

    def process_events(self):
        try:
            while True:
                event = self.events.get_nowait()

                if event[0] == "log":
                    _, source, message = event

                    widget = {
                        "xtts": self.xtts_log,
                        "discord": self.discord_log,
                        "system": self.system_log
                    }.get(source, self.system_log)

                    widget.configure(state="normal")
                    widget.insert("end", message + "\n")
                    widget.see("end")
                    widget.configure(state="disabled")

                elif event[0] == "status":
                    _, service, status = event

                    if service == "xtts":
                        self.xtts_status.set(status)
                        label = self.xtts_status_label
                    else:
                        self.discord_status.set(status)
                        label = self.discord_status_label

                    colors = {
                        "Online": "#4ade80",
                        "Offline": "#9ca3af",
                        "Starting": "#facc15",
                        "Stopping": "#facc15",
                        "Error": "#f87171"
                    }

                    label.configure(
                        fg=colors.get(status, "#ffffff")
                    )

                elif event[0] == "stopped":
                    self.starting.clear()
                    self.start_bot_button.configure(state="normal")
                    self.start_xtts_button.configure(state="normal")

                elif event[0] == "starting":
                    _, service, active = event
                    if active:
                        self.starting.add(service)
                    else:
                        self.starting.discard(service)
                    self.start_bot_button.configure(
                        state="disabled" if "discord" in self.starting else "normal"
                    )
                    self.start_xtts_button.configure(
                        state="disabled" if "xtts" in self.starting else "normal"
                    )

        except queue.Empty:
            pass

        if not self.closing:
            self.root.after(100, self.process_events)

    def find_python(self):
        candidates = [
            ROOT / ".venv" / "Scripts" / "python.exe",
            ROOT / "venv" / "Scripts" / "python.exe",
            XTTS_DIR / ".venv" / "Scripts" / "python.exe",
            XTTS_DIR / "venv" / "Scripts" / "python.exe"
        ]

        for candidate in candidates:
            if candidate.is_file():
                return str(candidate)

        return sys.executable

    def find_node(self):
        return shutil.which("node")

    def is_healthy(self):
        try:
            with urlopen(HEALTH_URL, timeout=2) as response:
                return response.status == 200
        except Exception:
            return False

    def start_bot(self):
        self.start_service("discord")

    def start_xtts(self):
        self.start_service("xtts")

    def start_service(self, service):
        process = self.discord_process if service == "discord" else self.xtts_process
        if service in self.starting or (process is not None and process.poll() is None):
            messagebox.showinfo("Uriel Bot", "Este serviço já está em execução ou iniciando.")
            return

        self.starting.add(service)
        self.events.put(("starting", service, True))
        self.stopping.clear()
        threading.Thread(target=self.start_sequence, args=(service,), daemon=True).start()

    def start_sequence(self, service):
        try:
            if service == "discord":
                if not (ROOT / "index.js").is_file():
                    raise FileNotFoundError("index.js não encontrado.")

                node = self.find_node()
                if not node:
                    raise RuntimeError("Node.js não encontrado no PATH.")

                self.log("system", "Iniciando Discord Bot...")
                self.set_status("discord", "Starting")
                if self.stopping.is_set():
                    return
                process = self.launch_process([node, "index.js"], ROOT, "discord")
                self.discord_process = process
                time.sleep(2)
                if self.stopping.is_set():
                    return
                if process.poll() is not None:
                    raise RuntimeError("Discord Bot encerrou durante a inicialização.")

                self.set_status("discord", "Online")
                self.log("system", "Discord Bot iniciado.")
            else:
                if not (XTTS_DIR / "server.py").is_file():
                    raise FileNotFoundError("xtts-service/server.py não encontrado.")

                if self.is_healthy():
                    raise RuntimeError(
                        "Já existe um serviço XTTS2 respondendo na porta 8000."
                    )

                python = self.find_python()
                self.log("system", "Iniciando XTTS2...")
                self.set_status("xtts", "Starting")
                if self.stopping.is_set():
                    return
                process = self.launch_process(
                    [python, "-u", "-m", "uvicorn", "server:app",
                     "--host", "127.0.0.1", "--port", "8000"],
                    XTTS_DIR, "xtts"
                )
                self.xtts_process = process
                deadline = time.monotonic() + HEALTH_TIMEOUT
                while time.monotonic() < deadline:
                    if self.stopping.is_set():
                        return
                    if process.poll() is not None:
                        raise RuntimeError("XTTS2 encerrou durante a inicialização.")
                    if self.is_healthy():
                        self.set_status("xtts", "Online")
                        self.log("system", "XTTS2 pronto.")
                        break
                    time.sleep(HEALTH_INTERVAL)
                else:
                    raise TimeoutError("XTTS2 não respondeu dentro de 180 segundos.")

        except Exception as error:
            self.log("system", f"Erro ao iniciar {service}: {error}")
            if not self.stopping.is_set():
                self.set_status(service, "Error")
                process = self.discord_process if service == "discord" else self.xtts_process
                self.stop_process(process, "Discord" if service == "discord" else "XTTS2")
                if service == "discord":
                    self.discord_process = None
                else:
                    self.xtts_process = None
        finally:
            self.events.put(("starting", service, False))

    def launch_process(self, command, cwd, source):
        flags = getattr(
            subprocess,
            "CREATE_NO_WINDOW",
            0
        )

        environment = os.environ.copy()
        environment["PYTHONUNBUFFERED"] = "1"
        environment["PYTHONIOENCODING"] = "utf-8"
        environment["PYTHONUTF8"] = "1"

        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=flags,
            env=environment
        )

        threading.Thread(
            target=self.read_output,
            args=(process, source),
            daemon=True
        ).start()

        return process

    def read_output(self, process, source):
        try:
            for line in process.stdout:
                self.log(source, line.rstrip())
        except Exception as error:
            self.log(
                "system",
                f"Erro ao ler logs de {source}: {error}"
            )
        finally:
            if process.stdout:
                process.stdout.close()

    def stop_all(self):
        self.stopping.set()
        self.start_bot_button.configure(state="disabled")
        self.start_xtts_button.configure(state="disabled")

        threading.Thread(
            target=self.stop_processes,
            daemon=True
        ).start()

    def stop_processes(self):
        self.set_status("discord", "Stopping")
        self.set_status("xtts", "Stopping")

        self.stop_process(self.discord_process, "Discord")
        self.stop_process(self.xtts_process, "XTTS2")

        self.discord_process = None
        self.xtts_process = None

        self.set_status("discord", "Offline")
        self.set_status("xtts", "Offline")

        self.log("system", "Serviços encerrados.")
        self.events.put(("stopped",))

    def stop_process(self, process, name):
        if process is None:
            return

        if process.poll() is not None:
            return

        self.log("system", f"Encerrando {name}...")

        try:
            if os.name == "nt":
                result = subprocess.run(
                    [
                        "taskkill",
                        "/PID",
                        str(process.pid),
                        "/T",
                        "/F"
                    ],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    creationflags=getattr(
                        subprocess,
                        "CREATE_NO_WINDOW",
                        0
                    )
                )

                if result.returncode != 0 and process.poll() is None:
                    process.terminate()
            else:
                process.terminate()

            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

        except Exception as error:
            self.log(
                "system",
                f"Erro ao encerrar {name}: {error}"
            )

    def monitor_processes(self):
        if self.xtts_process is not None:
            if self.xtts_process.poll() is not None:
                if self.xtts_status.get() == "Online":
                    self.log(
                        "system",
                        "XTTS2 encerrou inesperadamente."
                    )
                    self.set_status("xtts", "Offline")

        if self.discord_process is not None:
            if self.discord_process.poll() is not None:
                if self.discord_status.get() == "Online":
                    self.log(
                        "system",
                        "Discord Bot encerrou inesperadamente."
                    )
                    self.set_status("discord", "Offline")

        if not self.closing:
            self.root.after(1000, self.monitor_processes)

    def clear_logs(self):
        for widget in (
            self.xtts_log,
            self.discord_log,
            self.system_log
        ):
            widget.configure(state="normal")
            widget.delete("1.0", "end")
            widget.configure(state="disabled")

    def on_close(self):
        if self.closing:
            return

        self.closing = True
        self.stopping.set()
        self.root.withdraw()

        def shutdown():
            self.stop_processes()
            self.root.after(0, self.root.destroy)

        threading.Thread(
            target=shutdown,
            daemon=True
        ).start()


if __name__ == "__main__":
    root = tk.Tk()
    app = UrielLauncher(root)
    root.mainloop()
