"""
Habit Warrior — local dev server with cache disabled.

Run:  python server.py
Then open http://localhost:8000
"""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent the browser from serving any stale module / stylesheet.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving Habit Warrior on http://localhost:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
