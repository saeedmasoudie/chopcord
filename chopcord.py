import os
import json
import platform
import subprocess
import threading
import time
import socket
import hashlib
import urllib.parse
import http.server
import socketserver
import sys
import base64
import webbrowser
from pathlib import Path
import requests
import webview
from pystray import Icon as TrayIcon, MenuItem as TrayItem, Menu as TrayMenu
from PIL import Image, ImageDraw
from cryptography.fernet import Fernet

APP_NAME = "ChopCord"
APP_VERSION = "1.0.0"
SINGLE_INSTANCE_PORT = 53535


def get_resource_path(relative_path):
    base_dir = None

    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_dir, relative_path)


BASE_DIR = os.path.abspath(
    os.path.join(os.path.expanduser("~"), ".chopcord_secure")
)
CONFIG_FILE = os.path.join(BASE_DIR, "global_config.enc")
KEY_FILE = os.path.join(BASE_DIR, "secret.key")
PROFILES_DIR = os.path.join(BASE_DIR, "profiles")
MEDIA_DIR = os.path.join(BASE_DIR, "cache")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
ASSETS_DIR = get_resource_path("assets")
WEB_DIR = get_resource_path("web")

if not os.path.exists(WEB_DIR):
    print("ERROR: web directory missing:", WEB_DIR)


for d in [BASE_DIR, PROFILES_DIR, MEDIA_DIR, DOWNLOADS_DIR]:
    os.makedirs(d, exist_ok=True)


def open_file(path):
    try:
        if platform.system() == "Windows":
            os.startfile(path)
        elif platform.system() == "Darwin":
            subprocess.Popen(
                ["open", path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        else:
            subprocess.Popen(
                ["xdg-open", path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
    except Exception as e:
        print("Open file failed:", e)


def reveal_file(path):
    try:
        if platform.system() == "Windows":
            subprocess.Popen(f'explorer /select,"{path}"')
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", "-R", path])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(path)])
    except Exception as e:
        print("Reveal file failed:", e)


def notify(title, message):
    try:
        system = platform.system()

        if system == "Windows":
            try:
                from win10toast import ToastNotifier
                ToastNotifier().show_toast(
                    title,
                    message,
                    threaded=True,
                    duration=6
                )
            except ImportError:
                # No win10toast installed → ignore
                pass

        elif system == "Darwin":
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'display notification "{message}" with title "{title}"'
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        else:
            subprocess.Popen(
                ["notify-send", title, message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    except Exception as e:
        print("Notification error:", e)


class SingleInstanceLock:
    def __init__(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._locked = False

    def try_lock(self):
        try:
            self.socket.bind(('127.0.0.1', SINGLE_INSTANCE_PORT))
            self._locked = True
            return True
        except socket.error:
            return False

    def release(self):
        if self._locked:
            try:
                self.socket.close()
            except Exception:
                pass


app_lock = SingleInstanceLock()


class UpdateManager:
    def __init__(self):
        self.update_available = False
        self.latest_version = APP_VERSION
        self.release_url = (
            "https://github.com/saeedmasoudie/chopcord/releases/latest"
        )

    def check_updates(self):
        try:
            r = requests.get(
                "https://api.github.com/repos/saeedmasoudie/chopcord/releases/latest", # noqa: E501
                timeout=5
            )
            if r.status_code == 200:
                data = r.json()
                remote_ver = data.get('tag_name', '').strip()
                if remote_ver and remote_ver > APP_VERSION:
                    self.update_available = True
                    self.latest_version = remote_ver
                    self.release_url = data.get('html_url', self.release_url)
        except Exception:
            pass


updater = UpdateManager()


class AtomicDataHandler:
    def __init__(self):
        self.key = self._load_or_create_key()
        self.cipher = Fernet(self.key)
        self.lock = threading.Lock()

    def _load_or_create_key(self):
        if os.path.exists(KEY_FILE):
            return Path(KEY_FILE).read_bytes()
        k = Fernet.generate_key()
        Path(KEY_FILE).write_bytes(k)
        return k

    def encrypt_data(self, data_dict):
        return self.cipher.encrypt(json.dumps(data_dict).encode())

    def decrypt_data(self, encrypted_bytes):
        try:
            return json.loads(self.cipher.decrypt(encrypted_bytes).decode())
        except Exception:
            return {}

    def save_json_secure(self, filepath, data):
        with self.lock:
            temp_path = filepath + ".tmp"
            try:
                with open(temp_path, 'wb') as f:
                    f.write(self.encrypt_data(data))
                if os.path.exists(filepath):
                    os.remove(filepath)
                os.rename(temp_path, filepath)
                return True
            except Exception:
                return False

    def load_json_secure(self, filepath):
        with self.lock:
            if not os.path.exists(filepath):
                return {}
            try:
                with open(filepath, 'rb') as f:
                    return self.decrypt_data(f.read())
            except Exception:
                return {}


data_handler = AtomicDataHandler()


def get_logo_base64():
    local_logo = os.path.join(ASSETS_DIR, "logo.png")
    if os.path.exists(local_logo):
        try:
            with open(local_logo, "rb") as img_file:
                return "data:image/png;base64," + base64.b64encode(
                    img_file.read()
                ).decode('utf-8')
        except Exception:
            pass
    return ""


def load_web_content(filename):
    path = os.path.join(WEB_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    return f"<h1>Error: Missing {filename}</h1>"


class WindowManager:
    def __init__(self):
        self.active_window = None
        self.should_restart = False
        self.next_profile = None
        self.active_profile_name = "Default"
        self.media_port = 0

    def set_window(self, w):
        self.active_window = w

    def restart_app(self, profile_name):
        self.next_profile = profile_name
        self.should_restart = True
        try:
            self.active_window.destroy()
        except Exception:
            sys.exit(0)

    def minimize(self):
        try:
            self.active_window.minimize()
        except Exception:
            pass

    def maximize(self):
        try:
            if hasattr(self.active_window, 'toggle_fullscreen'):
                self.active_window.toggle_fullscreen()
            elif hasattr(self.active_window, 'maximize'):
                self.active_window.maximize()
        except Exception:
            pass

    def close_app(self):
        try:
            if self.active_window:
                self.active_window.destroy()
        except Exception:
            pass
        finally:
            sys.exit(0)

    def restore_window(self):
        try:
            self.active_window.restore()
        except Exception:
            pass


wm = WindowManager()


def apply_network_settings(proxy, dns):
    os.environ.pop("http_proxy", None)
    os.environ.pop("https_proxy", None)
    os.environ.pop("no_proxy", None)

    flags = [
        "--disk-cache-size=2147483648",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required",
        "--enable-smooth-scrolling",
        "--enable-features=WebRTC-H264WithOpenH264FFmpeg,NetworkService,NetworkServiceInProcess", # noqa: E501
        "--disable-features=DisallowNoneCookies"
    ]
    if proxy:
        flags.append(f"--proxy-server={proxy}")
        os.environ["http_proxy"] = proxy
        os.environ["https_proxy"] = proxy
        os.environ["no_proxy"] = "127.0.0.1,localhost"

    if dns:
        flags.append("--enable-features=DnsOverHttps<DoHTrial")
        flags.append("--force-effective-connection-type=4g")
        if "1.1.1.1" in dns:
            flags.append(
                "--dns-over-https-templates=https://cloudflare-dns.com/dns-query" # noqa: E501
            )
        elif "8.8.8.8" in dns:
            flags.append(
                "--dns-over-https-templates=https://dns.google/dns-query"
            )
    if platform.system() == "Windows":
        os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = " ".join(flags)


def create_tray_icon(has_warning=False):
    tray_logo_path = os.path.join(ASSETS_DIR, "logo.png")
    if os.path.exists(tray_logo_path):
        try:
            image = Image.open(tray_logo_path)
            image = image.resize((64, 64))
        except Exception:
            image = Image.new('RGB', (64, 64), (30, 31, 34))
    else:
        image = Image.new('RGB', (64, 64), (30, 31, 34))
        dc = ImageDraw.Draw(image)
        dc.rectangle((0, 0, 64, 64), fill=(30, 31, 34))
        dc.rectangle((16, 16, 48, 48), fill=(88, 101, 242))

    if has_warning:
        dc = ImageDraw.Draw(image)
        dc.ellipse(
            (40, 0, 64, 24), fill="#da373c", outline="#1e1f22", width=2
        )
        dc.text((47, 2), "!", fill="white", font_size=20)
    return image


def run_tray():
    def on_quit(icon, item):
        icon.stop()
        wm.close_app()

    def on_show(icon, item):
        wm.restore_window()

    menu = TrayMenu(TrayItem("Show", on_show), TrayItem("Quit", on_quit))
    icon = TrayIcon(
        "ChopCord",
        create_tray_icon(updater.update_available),
        menu=menu
    )
    icon.run()


def connection_monitor(window):
    last_status = True
    fail_count = 0
    FAIL_TOLERANCE = 3

    while True:
        if not wm.active_window:
            break

        time.sleep(5.0)
        try:
            requests.head("https://discord.com", timeout=8)
            fail_count = 0
            current_status = True
        except Exception:
            fail_count += 1
            if fail_count >= FAIL_TOLERANCE:
                current_status = False
            else:
                current_status = True

        if current_status != last_status:
            safe_bool = "true" if current_status else "false"
            try:
                window.evaluate_js(
                    f"if(window.setDiscordStatus) "
                    f"window.setDiscordStatus({safe_bool});"
                )
                if current_status:
                    window.evaluate_js(
                        "if(window.location.pathname === '/' || "
                        "window.location.pathname === '') "
                        "window.location.href = '/app';"
                    )
            except Exception:
                pass
            last_status = current_status


def _safe_fname_from_url(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        ext = os.path.splitext(parsed.path)[1].lower()
        if not ext and 'attachments' in url:
            ext = '.bin'
        h = hashlib.sha256(clean_url.encode('utf-8')).hexdigest()
        return f"{h}{ext}"
    except Exception:
        return ""


class EncryptedMediaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith('/media/'):
            return super().do_GET()
        try:
            fname = self.path.split('/media/', 1)[1]
            enc_path = os.path.join(MEDIA_DIR, fname + '.enc')
            data = None
            if os.path.exists(enc_path):
                data = data_handler.cipher.decrypt(open(enc_path, 'rb').read())
            if data is None:
                self.send_response(404)
                self.end_headers()
                return
            ct = 'application/octet-stream'
            if fname.endswith(('.jpg', '.jpeg')):
                ct = 'image/jpeg'
            elif fname.endswith('.png'):
                ct = 'image/png'
            elif fname.endswith('.webp'):
                ct = 'image/webp'
            elif fname.endswith('.mp4'):
                ct = 'video/mp4'
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_response(500)
            self.end_headers()


server_ready_event = threading.Event()


def start_media_server():
    for _ in range(3):
        try:
            server = socketserver.ThreadingTCPServer(
                ('127.0.0.1', 0), EncryptedMediaHandler
            )
            server.allow_reuse_address = True
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            server_ready_event.set()
            return server, server.server_address[1]
        except OSError:
            pass
    return None, 0


_download_states = {}


def _download_worker(url, is_explicit_user_download):
    try:
        filename = _safe_fname_from_url(url)
        if is_explicit_user_download:
            try:
                real_name = os.path.basename(urllib.parse.urlparse(url).path)
                if not real_name:
                    real_name = filename
                if not os.path.splitext(real_name)[1]:
                    real_name += os.path.splitext(filename)[1]
                final_path = os.path.join(DOWNLOADS_DIR, real_name)
                base, ext = os.path.splitext(real_name)
                counter = 1
                while os.path.exists(final_path):
                    final_path = os.path.join(
                        DOWNLOADS_DIR, f"{base}_{counter}{ext}"
                    )
                    counter += 1
            except Exception:
                final_path = os.path.join(DOWNLOADS_DIR, filename)
        else:
            final_path = os.path.join(MEDIA_DIR, filename + ".tmp")

        _download_states[url] = {
            'progress': 0,
            'status': 'downloading',
            'filename': os.path.basename(final_path)
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36"
        }
        r = requests.get(url, headers=headers, stream=True, timeout=30)
        r.raise_for_status()
        total_length = int(r.headers.get('content-length', 0))
        dl = 0
        with open(final_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    dl += len(chunk)
                    if total_length:
                        _download_states[url]['progress'] = int(
                            (dl / total_length) * 100
                        )
        if not is_explicit_user_download:
            try:
                enc_path = os.path.join(MEDIA_DIR, filename + '.enc')
                with open(final_path, 'rb') as src, \
                        open(enc_path, 'wb') as dest:
                    dest.write(data_handler.cipher.encrypt(src.read()))
            except Exception:
                pass
            if os.path.exists(final_path):
                os.remove(final_path)
        _download_states[url]['status'] = 'done'
        _download_states[url]['progress'] = 100
    except Exception as e:
        print(f"Download Error: {e}")
        _download_states[url]['status'] = 'error'


class ChopCordAPI:
    def minimize_window(self):
        wm.minimize()

    def maximize_window(self):
        wm.maximize()

    def close_window(self):
        wm.close_app()

    def get_current_profile(self):
        return wm.active_profile_name

    def get_config(self):
        return data_handler.load_json_secure(CONFIG_FILE)

    def get_media_port(self):
        return wm.media_port

    def save_config(self, cfg):
        cur = self.get_config()
        cur.update(cfg)
        data_handler.save_json_secure(CONFIG_FILE, cur)
        if '__clear_cache' in cfg and cfg['__clear_cache']:
            self.clear_cache()
        return "ok"

    def create_profile(self, name):
        safe = "".join(c for c in name if c.isalnum() or c == ' ').strip()
        os.makedirs(os.path.join(PROFILES_DIR, safe), exist_ok=True)
        return self.get_profiles_with_meta()

    def get_profiles_with_meta(self):
        profiles = ["Default"]
        if os.path.exists(PROFILES_DIR):
            for f in os.listdir(PROFILES_DIR):
                if os.path.isdir(os.path.join(PROFILES_DIR, f)):
                    profiles.append(f)
        return [{"id": n, "name": n} for n in profiles]

    def switch_profile(self, name):
        wm.restart_app(name)

    def restart_application(self):
        wm.restart_app(wm.active_profile_name)

    def start_download(self, url):
        if not url or not url.startswith('http'):
            return "error"
        threading.Thread(
            target=_download_worker, args=(url, True), daemon=True
        ).start()
        return "started"

    def get_download_status(self, url):
        return _download_states.get(url, None)

    def check_file_exists(self, url):
        try:
            fname = _safe_fname_from_url(url)
            dl_path = os.path.join(DOWNLOADS_DIR, fname)
            if os.path.exists(dl_path):
                return fname
            base_name = os.path.basename(urllib.parse.urlparse(url).path)
            if base_name and os.path.exists(
                os.path.join(DOWNLOADS_DIR, base_name)
            ):
                return base_name
            return False
        except Exception:
            return False

    def get_cache_stats(self):
        try:
            if not os.path.exists(MEDIA_DIR):
                return {"count": 0, "size_mb": 0}
            files = [f for f in os.listdir(MEDIA_DIR) if f.endswith('.enc')]
            total_size = sum(
                os.path.getsize(os.path.join(MEDIA_DIR, f)) for f in files
            )
            return {
                "count": len(files),
                "size_mb": round(total_size / (1024 * 1024), 2)
            }
        except Exception:
            return {"count": 0, "size_mb": 0}

    def get_downloads_list(self):
        try:
            files = []
            if not os.path.exists(DOWNLOADS_DIR):
                return []
            for f in os.listdir(DOWNLOADS_DIR):
                path = os.path.join(DOWNLOADS_DIR, f)
                if os.path.isfile(path):
                    files.append({
                        "name": f,
                        "size": round(os.path.getsize(path) / (1024 * 1024), 2)
                    })
            return files
        except Exception:
            return []

    def open_downloaded_file(self, filename):
        p = os.path.join(DOWNLOADS_DIR, os.path.basename(filename))
        if os.path.exists(p):
            open_file(p)

    def show_in_folder(self, filename):
        p = os.path.join(DOWNLOADS_DIR, os.path.basename(filename))
        if os.path.exists(p):
            reveal_file(p)

    def open_downloads_folder(self):
        try:
            p = DOWNLOADS_DIR
            if platform.system() == "Windows":
                os.startfile(p)
            else:
                subprocess.Popen(["xdg-open", p])
        except Exception:
            pass

    def delete_download(self, filename):
        try:
            path = os.path.join(DOWNLOADS_DIR, os.path.basename(filename))
            if os.path.exists(path):
                os.remove(path)
                return True
        except Exception:
            pass
        return False

    def check_proxy_connection(self, proxy_url):
        try:
            proxies = {"http": proxy_url, "https": proxy_url}
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36"
            }
            requests.get(
                "https://www.google.com",
                headers=headers,
                proxies=proxies,
                timeout=10
            )
            return True
        except Exception as e:
            print(f"Proxy Check Failed: {e}")
            return False

    def get_update_status(self):
        return {
            "available": updater.update_available,
            "version": updater.latest_version,
            "url": updater.release_url
        }

    def open_update_page(self):
        webbrowser.open(updater.release_url)

    def get_logo(self):
        return get_logo_base64()


def inject_core(window):
    try:
        for js in ("injector.js", "update_modal.js"):
            js_path = os.path.join(WEB_DIR, js)
            if os.path.exists(js_path):
                with open(js_path, "r", encoding="utf-8") as f:
                    window.evaluate_js(f.read() + "\n")
    except Exception as e:
        print("JS inject failed:", e)


def on_loaded(window):
    url = window.get_current_url()
    if url and "discord.com" in url and url.startswith("https://"):
        inject_core(window)
        window.evaluate_js("history.replaceState(null,'','/');")


def main():
    if not app_lock.try_lock():
        sys.exit(0)
    t_update = threading.Thread(
        target=updater.check_updates,
        daemon=True
    )
    t_update.start()

    active_profile = "Default"
    cfg = data_handler.load_json_secure(CONFIG_FILE)
    apply_network_settings(cfg.get("proxy", ""), cfg.get("dns", ""))

    threading.Thread(target=run_tray, daemon=True).start()
    t_update.join(timeout=1.5)

    if updater.update_available:
        notify(
            "Update available",
            f"Chopcord {updater.latest_version} is available"
        )

    server, media_port = start_media_server()
    server_ready_event.wait(timeout=5)
    wm.media_port = media_port

    while True:
        start_offline = False
        try:
            requests.head("https://discord.com", timeout=10)
        except Exception:
            start_offline = True

        cfg = data_handler.load_json_secure(CONFIG_FILE)
        apply_network_settings(cfg.get("proxy", ""), cfg.get("dns", ""))
        wm.active_profile_name = active_profile
        storage_path = (
            os.path.join(BASE_DIR, "default_storage")
            if active_profile == "Default"
            else os.path.join(PROFILES_DIR, active_profile)
        )
        os.makedirs(storage_path, exist_ok=True)
        api = ChopCordAPI()

        html_content = ""
        if start_offline:
            html_content = load_web_content("offline.html")
        else:
            raw_html = load_web_content("loading.html")
            html_content = raw_html.replace("{logo_src}", get_logo_base64())

        window = webview.create_window(
            APP_NAME,
            html=html_content if start_offline else html_content,
            js_api=api,
            width=1280,
            height=720,
            background_color='#09090b',
            text_select=True,
            min_size=(600, 400)
        )
        wm.set_window(window)
        threading.Thread(
            target=connection_monitor, args=(window,), daemon=True
        ).start()

        def load_app():
            time.sleep(2.0)
            if not start_offline:
                window.load_url("https://discord.com/app")

        threading.Thread(target=load_app, daemon=True).start()
        window.events.loaded += lambda: on_loaded(window)
        webview.start(
            private_mode=False, storage_path=storage_path, debug=False
        )

        if wm.should_restart:
            active_profile = wm.next_profile
            wm.should_restart = False
        else:
            break
    app_lock.release()


if __name__ == '__main__':
    main()
