"""serve.py: small local web server to test the website (SPECIFICATION_WEBSITE.md, section 5). A page opened from a file cannot load its data.

    python website/serve.py [--port 8000] [--no-browser]

Serves this folder (the page and its assets/) on 127.0.0.1 only and opens http://localhost:<port>/.
"""
import argparse, functools, http.server, mimetypes, webbrowser
from pathlib import Path

WEBSITE = Path(__file__).resolve().parent
mimetypes.add_type('image/avif', '.avif')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('text/javascript', '.js')


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'   # keeps the connections: one per picture would use up the buffers of Windows on a page with hundreds of pictures (ERR_NO_BUFFER_SPACE)

    def log_message(self, *args):   # no line per request (hundreds of pictures)
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--no-browser', action='store_true')
    a = ap.parse_args()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', a.port), functools.partial(Handler, directory=str(WEBSITE)))
    url = f'http://localhost:{a.port}/'
    print(f'{url}   (Ctrl+C ends the server)', flush=True)
    if not a.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
