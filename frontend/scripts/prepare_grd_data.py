"""Convierte el GRD limpio (parquet) en los archivos que lee el frontend.

Uso (desde frontend/):  python scripts/prepare_grd_data.py
Requiere pandas y pyarrow. Lee ../GRD_CIE_TM/GRD_limpio/grd_respiratorio_2019_2024.parquet
(generado por Procesamiento/limpieza_basica_GRD.ipynb) y escribe en public/data/:

Solo se exportan hospitalizaciones (ES_HOSPITALIZACION = True): se excluyen cirugía mayor ambulatoria
y hospitalización diurna, que quedan contadas en grd-meta.json.

  grd.bin        columnas codificadas como enteros, una tras otra (little-endian):
                 day u16 | stay u16 | commune u16 | region u8 | age u8 | sex u8 | diag u8 | cohort u8
  grd-meta.json  cantidad de filas, diccionarios (tramos, diagnósticos), cobertura y la población
                 FONASA (../Procesamiento/poblacion_fonasa_2019_2024.csv) para calcular tasas.

No se exportan identificadores de paciente, hospital ni fechas exactas de nacimiento.
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = RAIZ / 'GRD_CIE_TM' / 'GRD_limpio' / 'grd_respiratorio_2019_2024.parquet'
DESTINO = Path(__file__).resolve().parents[1] / 'public' / 'data'
CATALOGO_COMUNAS = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'communes.json'
POBLACION = RAIZ / 'Procesamiento' / 'poblacion_fonasa_2019_2024.csv'

FECHA_BASE = pd.Timestamp('2019-01-01')
# Debe coincidir con ETIQUETAS_TRAMO del notebook y con src/utils/ages.ts.
TRAMOS = ['Infancia (0-4)', 'Niñez y adolescencia (5-14)', 'Jóvenes (15-29)',
          'Adultos (30-49)', 'Adultos maduros (50-64)', 'Adultos mayores (65+)']
SEXOS = {'MUJER': 0, 'HOMBRE': 1, 'DESCONOCIDO': 2}
SIN_DATO_U8 = 255
SIN_DATO_U16 = 65535


def main():
    todos = pd.read_parquet(ORIGEN, columns=['CUT', 'COD_REGION', 'SEXO', 'TRAMO_EDAD', 'FECHA_INGRESO', 'FECHA_ALTA',
                                             'DIAGNOSTICO1', 'DIAGNOSTICO1_DESC', 'TIPO_ACTIVIDAD', 'ES_HOSPITALIZACION',
                                             'HOSPITAL_EN_COHORTE'])
    excluidos = todos.loc[~todos['ES_HOSPITALIZACION'], 'TIPO_ACTIVIDAD'].value_counts()
    df = todos.loc[todos['ES_HOSPITALIZACION']].reset_index(drop=True)
    n = len(df)

    dia = (df['FECHA_ALTA'] - FECHA_BASE).dt.days
    assert dia.between(0, SIN_DATO_U16 - 1).all(), 'FECHA_ALTA fuera de rango'

    estadia = (df['FECHA_ALTA'] - df['FECHA_INGRESO']).dt.days
    assert (estadia.dropna() >= 0).all(), 'Hay estadías negativas'
    assert (estadia.dropna() < SIN_DATO_U16).all(), 'Estadía demasiado larga para u16'
    estadia = estadia.fillna(SIN_DATO_U16)

    comunas_validas = {c['id'] for c in json.loads(CATALOGO_COMUNAS.read_text(encoding='utf-8-sig'))}
    faltantes = set(df['CUT'].dropna()) - comunas_validas
    assert not faltantes, f'CUT ausentes en communes.json: {sorted(faltantes)}'
    comuna = pd.to_numeric(df['CUT'], errors='raise').fillna(0)
    region = pd.to_numeric(df['COD_REGION'], errors='raise').fillna(0)

    desconocidos = set(df['TRAMO_EDAD'].dropna()) - set(TRAMOS) - {'DESCONOCIDO'}
    assert not desconocidos, f'Tramos no esperados: {desconocidos}'
    edad = df['TRAMO_EDAD'].map({t: i for i, t in enumerate(TRAMOS)}).fillna(SIN_DATO_U8)

    assert set(df['SEXO'].dropna()) <= set(SEXOS), f'Sexos no esperados: {set(df["SEXO"].dropna())}'
    sexo = df['SEXO'].map(SEXOS).fillna(SEXOS['DESCONOCIDO'])

    diagnosticos = (df.groupby('DIAGNOSTICO1')['DIAGNOSTICO1_DESC'].first().sort_index())
    assert len(diagnosticos) < SIN_DATO_U8
    diag = df['DIAGNOSTICO1'].map({c: i for i, c in enumerate(diagnosticos.index)})
    assert diag.notna().all()

    cohorte = df['HOSPITAL_EN_COHORTE'].astype(np.uint8)

    columnas = [(dia, np.uint16), (estadia, np.uint16), (comuna, np.uint16),
                (region, np.uint8), (edad, np.uint8), (sexo, np.uint8), (diag, np.uint8), (cohorte, np.uint8)]
    DESTINO.mkdir(parents=True, exist_ok=True)
    with open(DESTINO / 'grd.bin', 'wb') as f:
        for serie, tipo in columnas:
            f.write(np.asarray(serie, dtype='<' + np.dtype(tipo).str[1:]).tobytes())

    # Población FONASA: [año, CUT (0 = sin comuna), sexo, tramo (255 = desconocido), beneficiarios]
    pob = pd.read_csv(POBLACION, dtype={'CUT': str, 'COD_REGION': str})
    assert set(pob['TRAMO_EDAD']) <= set(TRAMOS) | {'DESCONOCIDO'}, 'Tramos de población distintos a TRAMOS'
    assert set(pob['SEXO']) <= set(SEXOS), f'Sexos de población no esperados: {set(pob["SEXO"])}'
    faltan_pob = set(pob['CUT'].dropna()) - comunas_validas
    assert not faltan_pob, f'CUT de población ausentes en communes.json: {sorted(faltan_pob)}'
    poblacion = [[int(r.ANIO), int(r.CUT) if isinstance(r.CUT, str) else 0, SEXOS[r.SEXO],
                  TRAMOS.index(r.TRAMO_EDAD) if r.TRAMO_EDAD in TRAMOS else SIN_DATO_U8, round(float(r.POBLACION), 1)]
                 for r in pob.itertuples(index=False) if r.POBLACION > 0]

    fecha_min = df['FECHA_ALTA'].min().date().isoformat()
    fecha_max = df['FECHA_ALTA'].max().date().isoformat()
    meta = {
        'rows': n,
        'baseDate': FECHA_BASE.date().isoformat(),
        'minDate': fecha_min,
        'maxDate': fecha_max,
        'maxStay': int(estadia[estadia != SIN_DATO_U16].max()),
        'ageLabels': TRAMOS,
        'diagnoses': [{'id': c, 'label': f'{c} · {d}' if isinstance(d, str) else c}
                      for c, d in diagnosticos.items()],
        'source': 'GRD público 2019–2024, hospitalizaciones con diagnóstico principal J00–J99',
        'excludedTotal': int(excluidos.sum()),
        'excludedActivities': {k: int(v) for k, v in excluidos.items()},
        'sourceFile': ORIGEN.name,
        'sourceModified': datetime.fromtimestamp(ORIGEN.stat().st_mtime, timezone.utc).date().isoformat(),
        'generatedAt': date.today().isoformat(),
        'population': {
            'source': 'Beneficiarios FONASA a diciembre de cada año; 2022-2023 con grupos de 10 años repartidos por estimación',
            'file': POBLACION.name,
            'rows': poblacion,
        },
    }
    (DESTINO / 'grd-meta.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print(f'{n:,} hospitalizaciones · {fecha_min} a {fecha_max} · {len(diagnosticos)} diagnósticos')
    print(f'Excluidos (no hospitalización): {int(excluidos.sum()):,} {dict(excluidos)}')
    print(f'Sin región: {int((region == 0).sum())} · edad desconocida: {int((edad == SIN_DATO_U8).sum())} '
          f'· sexo desconocido: {int((sexo == 2).sum())}')
    print(f'Fuera de la cohorte de hospitales: {int((cohorte == 0).sum()):,} · filas de población: {len(poblacion):,}')
    print(f'Escrito {DESTINO / "grd.bin"} ({(DESTINO / "grd.bin").stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
