#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
