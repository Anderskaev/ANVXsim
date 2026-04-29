import sys
import os

def read_env(path):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            value = val.strip().strip("'").strip('"')
            os.environ.setdefault(key.strip(), value)
read_env(os.path.join(os.path.dirname(__file__), '.env'))

INTERP = os.getenv('PYTHON_INTERP')
if sys.executable != INTERP:
   os.execl(INTERP, INTERP, *sys.argv)

sys.path.append(os.getcwd())

from app import create_app
application = create_app()

if __name__ == "__main__":
   application.run(host='0.0.0.0')