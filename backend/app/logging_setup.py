import logging
import json
from datetime import datetime

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.fromtimestamp(record.created).isoformat() + "Z",
            "name": record.name,
            "filename": record.filename,
            "lineno": record.lineno,
            "funcName": record.funcName
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)

# Configure the shared logger
logger = logging.getLogger("astracrowd")
logger.setLevel(logging.INFO)

# Guarantee a clean single handler state
logger.handlers.clear()
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False
