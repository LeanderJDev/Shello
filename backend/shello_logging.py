import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "server.log")


def setup_logging(level=logging.INFO):
    logger = logging.getLogger("shello")
    logger.setLevel(level)
    if not logger.handlers:
        handler = RotatingFileHandler(
            LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=7
        )
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s socket=%(socket)s event=%(event)s payload=%(payload)s result=%(result)s error=%(error)s duration_ms=%(duration_ms)s audience=%(audience)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


# convenience wrapper to produce structured log records
def log_with(
    logger,
    level,
    *,
    socket=None,
    event=None,
    payload=None,
    result=None,
    error=None,
    duration_ms=None,
    audience=None,
):
    extra = {
        "socket": f"{socket}" if socket is not None else "-",
        "event": event or "-",
        "payload": payload or "-",
        "result": result or "-",
        "error": error or "-",
        "duration_ms": duration_ms or "-",
        "audience": audience or "-",
    }
    logger.log(level, "", extra=extra)
