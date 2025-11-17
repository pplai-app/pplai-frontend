#!/usr/bin/env python3

"""
Lightweight development server with HTML5 history fallback.
Serves real files when they exist and falls back to index.html otherwise.
"""

import http.server
import os
import socketserver
from urllib.parse import urlparse

FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("DEV_SERVER_HOST", "0.0.0.0")
PORT = int(os.environ.get("DEV_SERVER_PORT", "8080"))


class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def do_GET(self):
        if self._serve_requested_path():
            return
        self._serve_index()

    def do_HEAD(self):
        if self._serve_requested_path(head_only=True):
            return
        self._serve_index(head_only=True)

    def _serve_requested_path(self, head_only: bool = False) -> bool:
        """Return True if the requested asset exists and was served."""
        parsed_path = urlparse(self.path)
        requested_path = parsed_path.path
        fs_path = self.translate_path(requested_path)
        
        # Debug logging
        print(f"[DEBUG] Requested: {requested_path} -> FS: {fs_path} -> Exists: {os.path.exists(fs_path)}")

        # Serve files (including JS/CSS) directly
        if os.path.exists(fs_path) and not os.path.isdir(fs_path):
            print(f"[DEBUG] Serving file directly: {fs_path}")
            if head_only:
                return http.server.SimpleHTTPRequestHandler.do_HEAD(self) or True
            http.server.SimpleHTTPRequestHandler.do_GET(self)
            return True

        # If directory requested, try its index.html
        if os.path.isdir(fs_path):
            index_path = os.path.join(fs_path, "index.html")
            if os.path.exists(index_path):
                # Ensure path is relative for handler
                if not requested_path.endswith("/"):
                    requested_path += "/"
                self.path = f"{requested_path}index.html"
                if head_only:
                    return http.server.SimpleHTTPRequestHandler.do_HEAD(self) or True
                http.server.SimpleHTTPRequestHandler.do_GET(self)
                return True

        return False

    def _serve_index(self, head_only: bool = False):
        self.path = "/index.html"
        if head_only:
            http.server.SimpleHTTPRequestHandler.do_HEAD(self)
        else:
            http.server.SimpleHTTPRequestHandler.do_GET(self)

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


def run():
    with socketserver.TCPServer((HOST, PORT), SPARequestHandler) as httpd:
        print(f"🚀 pplai.app frontend dev server running at http://{HOST}:{PORT}")
        print("    Serving directory:", FRONTEND_DIR)
        print("    SPA fallback enabled (unknown routes -> index.html)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down dev server…")


if __name__ == "__main__":
    run()

