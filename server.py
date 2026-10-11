#!/usr/bin/env python3
"""ChordLab 本地静态服务器：在标准 http.server 基础上强制 JS/HTML/CSS 协商缓存
（Cache-Control: no-cache → 每次带 If-Modified-Since 再验证，未变返回 304，
文件更新后浏览器立刻拿到新版本，杜绝启发式缓存跑旧代码的问题）。"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):  # 安静模式：仅打印错误与首次启动
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"[ChordLab] Local server: http://127.0.0.1:{port}  (Ctrl+C to stop)")
    server.serve_forever()
