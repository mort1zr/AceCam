"""movement.heatmap para la web (TA-33/PCIT-235): cuadrícula de la propia mitad de cada jugador.

A diferencia de report/heatmap.py (mapa del partido completo para el informe HTML), esta
cuadrícula solo cubre la mitad de cada jugador y usa su propio punto de vista en las columnas,
para que el Dashboard la dibuje y la sume entre partidos (docs/firestore-schema.md).
"""

import math

import pytest

from court import COURT_LENGTH, DOUBLES_WIDTH
from stats import HEATMAP_CELL_M, build_model_statistics, heatmap_cells
from stats.match_stats import FAR_PLAYER, NEAR_PLAYER

FPS = 30
COLUMNS = math.ceil(DOUBLES_WIDTH / HEATMAP_CELL_M)
ROWS = math.ceil((COURT_LENGTH / 2) / HEATMAP_CELL_M)
NET_Y = COURT_LENGTH / 2


def stay(x, y, frames):
    return [(x, y)] * frames


def test_tamano_de_cuadricula_fijo_y_con_celdas_de_medio_metro():
    heatmap = heatmap_cells(stay(1.0, 1.0, 1), NEAR_PLAYER, FPS)

    assert heatmap["columns"] == COLUMNS
    assert heatmap["rows"] == ROWS
    assert len(heatmap["cells"]) == COLUMNS * ROWS


def test_el_jugador_cercano_tiene_la_fila_0_junto_a_la_red_y_la_columna_0_a_su_izquierda():
    # Jugador 2 (cercano): su izquierda es x bajo (serve_side()); la red está en NET_Y.
    heatmap = heatmap_cells(stay(0.2, NET_Y + 0.1, FPS), NEAR_PLAYER, FPS)  # esquina red-izquierda

    assert heatmap["cells"][0] == pytest.approx(1.0)  # fila 0, columna 0
    assert sum(1 for v in heatmap["cells"] if v) == 1


def test_el_jugador_lejano_invierte_las_columnas_respecto_al_cercano():
    # Misma x_m para los dos jugadores, pero su "izquierda" está invertida (TA-34).
    lejano = heatmap_cells(stay(0.2, NET_Y - 0.1, FPS), FAR_PLAYER, FPS)  # cerca de la red, x=0.2
    cercano = heatmap_cells(stay(0.2, NET_Y + 0.1, FPS), NEAR_PLAYER, FPS)

    columna_lejano = next(i % COLUMNS for i, v in enumerate(lejano["cells"]) if v)
    columna_cercano = next(i % COLUMNS for i, v in enumerate(cercano["cells"]) if v)
    assert columna_lejano == COLUMNS - 1  # x=0.2 es la derecha del jugador lejano
    assert columna_cercano == 0  # x=0.2 es la izquierda del jugador cercano


def test_la_fila_crece_hacia_la_linea_de_fondo_para_los_dos_jugadores():
    # A medio metro de la red, cada jugador debería caer en la fila 1 (no la 0).
    lejano = heatmap_cells(stay(5.0, NET_Y - HEATMAP_CELL_M - 0.01, FPS), FAR_PLAYER, FPS)
    cercano = heatmap_cells(stay(5.0, NET_Y + HEATMAP_CELL_M + 0.01, FPS), NEAR_PLAYER, FPS)

    assert next(i // COLUMNS for i, v in enumerate(lejano["cells"]) if v) == 1
    assert next(i // COLUMNS for i, v in enumerate(cercano["cells"]) if v) == 1


def test_posiciones_fuera_de_la_cancha_se_ajustan_al_borde_sin_perder_tiempo():
    heatmap = heatmap_cells(stay(DOUBLES_WIDTH + 5.0, COURT_LENGTH + 5.0, 15), NEAR_PLAYER, FPS)

    assert sum(heatmap["cells"]) == pytest.approx(0.5)
    assert heatmap["cells"][-1] == pytest.approx(0.5)  # última fila, última columna


def test_el_tiempo_se_acumula_sin_normalizar_y_se_ignoran_las_posiciones_ausentes():
    posiciones = stay(1.0, NET_Y + 1.0, 45) + [None, None] + stay(1.0, NET_Y + 1.0, 15)
    heatmap = heatmap_cells(posiciones, NEAR_PLAYER, FPS)

    assert sum(heatmap["cells"]) == pytest.approx(60 / FPS)


def test_devuelve_none_sin_ninguna_posicion_valida():
    assert heatmap_cells([None, None, (float("nan"), 1.0)], NEAR_PLAYER, FPS) is None


def test_build_model_statistics_adjunta_el_heatmap_dentro_de_movement():
    positions = [{FAR_PLAYER: (5.0, 1.0), NEAR_PLAYER: (5.0, NET_Y + 1.0)}] * 30
    model = build_model_statistics([], positions, fps=FPS, num_frames=30)

    for player in (FAR_PLAYER, NEAR_PLAYER):
        movement = model["players"][str(player)]["movement"]
        assert movement["heatmap"]["columns"] == COLUMNS
        assert movement["heatmap"]["rows"] == ROWS
        assert sum(movement["heatmap"]["cells"]) == pytest.approx(30 / FPS)


def test_sin_posiciones_no_hay_movement_ni_heatmap():
    model = build_model_statistics([], [{} for _ in range(10)], fps=FPS, num_frames=10)

    assert "movement" not in model["players"]["1"]
    assert "movement" not in model["players"]["2"]
