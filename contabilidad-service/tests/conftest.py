import os
import tempfile

_fd, _test_db = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db.replace(chr(92), '/')}"

# Los tests no deben escribir facturas ni Excel en el storage real del usuario.
os.environ.setdefault("STORAGE_ROOT", tempfile.mkdtemp(prefix="contable_test_storage_"))
