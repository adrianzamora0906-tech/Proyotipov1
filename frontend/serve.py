#!/usr/bin/env python3
"""
Servidor de desarrollo simple para SportmancarERP
Ejecutar: python frontend/serve.py
Luego abrir: http://localhost:8080
"""

import http.server
import socketserver
import os
import socket
import errno
import sys
import json
from urllib.parse import urlparse

# Intentar encontrar un puerto disponible
PORT = 8080
while PORT < 9000:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', PORT))
    sock.close()
    if result != 0:  # Puerto disponible
        break
    PORT += 1

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Handler que sirve SPA correctamente"""

    def serve_runtime_config(self):
        """Expone al navegador únicamente la configuración pública del frontend."""
        values = {}
        try:
            with open('.env', 'r', encoding='utf-8') as env_file:
                for raw_line in env_file:
                    line = raw_line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, value = line.split('=', 1)
                    values[key.strip()] = value.strip().strip('"').strip("'")
        except FileNotFoundError:
            pass

        api_base_url = values.get('API_BASE_URL', 'http://localhost:5000/api')
        requested_host = (self.headers.get('Host') or '').split(':', 1)[0].strip()
        parsed_api = urlparse(api_base_url)
        if (parsed_api.hostname in ('localhost', '127.0.0.1')
                and requested_host not in ('', 'localhost', '127.0.0.1')):
            api_port = parsed_api.port or (443 if parsed_api.scheme == 'https' else 80)
            api_base_url = f'{parsed_api.scheme}://{requested_host}:{api_port}{parsed_api.path}'

        public_config = {
            'API_BASE_URL': api_base_url,
            'MOODLE_URL': values.get('MOODLE_URL', '')
        }
        body = f"window.__SPORTMANCAR_CONFIG__ = {json.dumps(public_config)};".encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    
    def do_GET(self):
        # Parse URL
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/env.js':
            return self.serve_runtime_config()
        
        # Si es un archivo, servirlo normalmente
        if '.' in path:
            try:
                return super().do_GET()
            except ConnectionAbortedError:
                return
            except BrokenPipeError:
                return
            except OSError as e:
                if e.errno in (errno.ECONNRESET, errno.EPIPE):
                    return
                raise
        
        # Si es una ruta, servir index.html
        try:
            with open('index.html', 'rb') as f:
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                try:
                    self.wfile.write(f.read())
                except ConnectionAbortedError:
                    return
                except BrokenPipeError:
                    return
                except OSError as e:
                    if e.errno in (errno.ECONNRESET, errno.EPIPE):
                        return
                    raise
        except FileNotFoundError:
            self.send_error(404)

    def end_headers(self):
        # Headers para SPA
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        """Formato de logging personalizado"""
        if '200' in str(args):
            print(f'✅ {args[0]}')
        else:
            print(f'⚠️  {args[0]}')

class ThreadedSPAServer(socketserver.ThreadingTCPServer):
    """Atiende en paralelo los recursos que carga el navegador y Cloudflare."""

    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with ThreadedSPAServer(("", PORT), SPAHandler) as httpd:
        print(f"""
╔═══════════════════════════════════════╗
    ║        🏫 SportmancarERP Servidor         ║
║                                       ║
║  Abierto en: http://localhost:{PORT}   ║
║  Presiona Ctrl+C para detener        ║
╚═══════════════════════════════════════╝
        """)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n\n👋 Servidor detenido')
