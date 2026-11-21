#!/usr/bin/env python3
"""Local dev server for the game. Run from the repository root:

    python3 tools/dev/serve.py [port] [--open]

Files are never cached by the browser. With --open the server reports a Saturday as the
current date, so the weekend race-hours check always lets the game start."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ALWAYS_OPEN = '--open' in sys.argv
ports = [a for a in sys.argv[1:] if a.isdigit()]


class Handler(SimpleHTTPRequestHandler):
    def date_time_string(self, timestamp=None):
        if ALWAYS_OPEN and timestamp is None:
            return 'Sat, 21 Nov 2026 17:00:00 GMT'
        return super().date_time_string(timestamp)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


ThreadingHTTPServer(('127.0.0.1', int(ports[0]) if ports else 8123), Handler).serve_forever()
