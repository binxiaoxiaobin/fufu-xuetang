import sys, tempfile, unittest, gzip, os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from static_cache import CompressedFiles

class CacheTests(unittest.TestCase):
    def test_hit_does_not_compress_again_and_file_change_invalidates(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'test.js'; path.write_bytes(b'a'*5000)
            cache = CompressedFiles()
            first = cache.get(path, path.stat())
            with patch('static_cache.gzip.compress', side_effect=AssertionError('unexpected compression')):
                self.assertEqual(first, cache.get(path, path.stat()))
            path.write_bytes(b'b'*6000)
            self.assertEqual(b'b'*6000, gzip.decompress(cache.get(path, path.stat())))

    def test_cache_is_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = CompressedFiles(max_bytes=100, max_entries=2)
            for i in range(10):
                path = Path(folder)/str(i); path.write_bytes(str(i).encode()*1000)
                cache.get(path,path.stat())
                self.assertLessEqual(cache.size, 100)
                self.assertLessEqual(len(cache.entries), 2)

if __name__ == '__main__': unittest.main()
