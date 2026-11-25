"""¿Hay partidos en cola? (PCIT-247). Lo usa el workflow del worker antes de descargar la imagen.

Escribe `hay=true` o `hay=false` en $GITHUB_OUTPUT. Así, cada 10 minutos, el workflow solo
descarga la imagen del modelo (unos 2 GB) cuando de verdad hay un partido que procesar.

Variables de entorno:
    FIREBASE_SERVICE_ACCOUNT   JSON de la cuenta de servicio del worker (secreto de GitHub)
    FIREBASE_PROJECT_ID        por defecto, acecam-e93a2
"""

from __future__ import annotations

import json
import os
import sys

QUEUED = "en cola"


def queued_count(db, field_filter, limit: int = 1) -> int:
    """Cuántos partidos en cola hay (como mucho `limit`): basta con saber si hay alguno.

    `field_filter` es FieldFilter de google-cloud-firestore; se recibe como parámetro para que los
    tests no dependan de esa librería.
    """
    query = db.collection("matches").where(filter=field_filter("status", "==", QUEUED)).limit(limit)
    return sum(1 for _ in query.stream())


def write_output(has_work: bool, path: str | None) -> None:
    line = f"hay={'true' if has_work else 'false'}\n"
    if path:
        with open(path, "a", encoding="utf-8") as output:
            output.write(line)
    print(line.strip())


def main() -> int:
    content = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not content:
        print("::error::Falta FIREBASE_SERVICE_ACCOUNT.", file=sys.stderr)
        return 1
    from google.cloud import firestore
    from google.cloud.firestore_v1.base_query import FieldFilter
    from google.oauth2 import service_account

    info = json.loads(content)
    credentials = service_account.Credentials.from_service_account_info(info)
    db = firestore.Client(project=os.environ.get("FIREBASE_PROJECT_ID", "acecam-e93a2"), credentials=credentials)
    write_output(queued_count(db, FieldFilter) > 0, os.environ.get("GITHUB_OUTPUT"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
