"""Create / upgrade the MySQL schema and load seed content, without starting the server.

This is the same work `backend/server.py` does before it starts listening, extracted so the
database can be prepared on its own: useful for first-time setup, for running the content /
catalog scripts, and for CI-style checks.

Usage (from the project root, with FUFU_MYSQL_PASSWORD set):
    python scripts/init_backend_db.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from startup import initialize_application  # noqa: E402


def main():
    print("创建 / 升级服务运行所需的全部数据库结构与目录…")
    initialize_application()
    print("数据库已就绪。接下来可以运行：python scripts/seed_zoo_animals.py")


if __name__ == "__main__":
    main()
