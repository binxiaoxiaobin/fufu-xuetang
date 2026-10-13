"""Bounded cache for compressed public files; never contains learner responses."""
import gzip
import threading
from collections import OrderedDict


class CompressedFiles:
    def __init__(self, max_bytes=16 * 1024 * 1024, max_entries=64):
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.entries = OrderedDict()
        self.size = 0
        self.lock = threading.Lock()

    def get(self, path, stat):
        key = (str(path), stat.st_mtime_ns, stat.st_size)
        # Serialize misses: simultaneous first visits must not compress the same file repeatedly.
        with self.lock:
            if key in self.entries:
                self.entries.move_to_end(key)
                return self.entries[key]
            with open(path, 'rb') as handle:
                raw = handle.read()
            body = gzip.compress(raw, 6)
            if len(body) >= len(raw):
                return None
            if len(body) <= self.max_bytes:
                while self.entries and (self.size + len(body) > self.max_bytes or len(self.entries) >= self.max_entries):
                    _, old = self.entries.popitem(last=False)
                    self.size -= len(old)
                self.entries[key] = body
                self.size += len(body)
            return body


compressed_files = CompressedFiles()
