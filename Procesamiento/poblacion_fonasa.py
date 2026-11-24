"""Población beneficiaria FONASA (diciembre de cada año) por comuna, sexo y tramo de edad, 2019-2024.

Uso (desde la raíz del repositorio):  python Procesamiento/poblacion_fonasa.py
Lee los zip de datos_grd/Fonasa/ (bases por persona, ~15 GB en total; tarda unos minutos) y escribe
Procesamiento/poblacion_fonasa_2019_2024.csv con:

    ANIO, CUT, COD_REGION, SEXO, TRAMO_EDAD, POBLACION, ESTIMADO

* Solo se cuentan personas: no se guarda ningún identificador.
* CUT: 2019-2020 traen el código; 2021-2024 solo el nombre, que se traduce al CUT con los nombres de 2019.
  Comuna "Desconocida" o vacía -> CUT y COD_REGION vacíos (cuentan en el total nacional, no en el comunal).
* SEXO con los mismos valores que el GRD: HOMBRE, MUJER, DESCONOCIDO.
* TRAMO_EDAD: los 6 tramos del proyecto (ETIQUETAS_TRAMO del notebook); edad sin información -> DESCONOCIDO.
* 2022 y 2023 vienen en grupos de 10 años. Los grupos 0-9, 10-19 y 60-69 cruzan un límite de tramo y se reparten
  con la proporción observada en 2021 y 2024 (mismo CUT y sexo; si no hay datos, región y sexo; luego país y sexo).
  Esas filas quedan con ESTIMADO = True y POBLACION no entera.
"""
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / 'datos_grd' / 'Fonasa'
SALIDA = RAIZ / 'Procesamiento' / 'poblacion_fonasa_2019_2024.csv'

# Deben coincidir con BINS_TRAMO / ETIQUETAS_TRAMO de limpieza_basica_GRD.ipynb
BINS_TRAMO = [0, 5, 15, 30, 50, 65, 200]
ETIQUETAS_TRAMO = ['Infancia (0-4)', 'Niñez y adolescencia (5-14)', 'Jóvenes (15-29)',
                   'Adultos (30-49)', 'Adultos maduros (50-64)', 'Adultos mayores (65+)']
# Límite de tramo que cae dentro de un grupo de 10 años de 2022-2023
GRUPOS_A_REPARTIR = {(0, 9): 5, (10, 19): 15, (60, 69): 65}

COLUMNAS = {'MES_INFORMACION': 'MES', 'SEXO_COR': 'SEXO', 'SEXO': 'SEXO', 'EDAD_TRAMO': 'EDAD_TRAMO',
            'COD_COMUNA_PERNAT': 'COD_COMUNA', 'DESC_COMUNA_PERNAT': 'COMUNA', 'COMUNA_BENEFICIARIO': 'COMUNA'}


def normalizar(texto):
    sin_tildes = ''.join(c for c in unicodedata.normalize('NFD', str(texto).upper()) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', sin_tildes).strip()


def contar_zip(ruta):
    """Cuenta personas por mes, sexo, tramo FONASA y comuna, leyendo el CSV dentro del zip por partes."""
    with zipfile.ZipFile(ruta) as z:
        miembro = z.namelist()[0]
        with z.open(miembro) as fh:
            cabecera = fh.readline().decode('latin-1')
        sep = '|' if cabecera.count('|') > cabecera.count(',') else ','
        usar = [c for c in (n.strip().strip('"') for n in cabecera.strip().split(sep)) if c in COLUMNAS]
        partes = []
        with z.open(miembro) as fh:
            for chunk in pd.read_csv(fh, sep=sep, encoding='latin-1', dtype=str, usecols=usar,
                                     chunksize=2_000_000, keep_default_na=False):
                chunk = chunk.rename(columns=COLUMNAS)
                if 'COD_COMUNA' not in chunk:
                    chunk['COD_COMUNA'] = ''
                partes.append(chunk.groupby(['MES', 'SEXO', 'EDAD_TRAMO', 'COD_COMUNA', 'COMUNA']).size().rename('N'))
    conteo = pd.concat(partes).groupby(level=[0, 1, 2, 3, 4]).sum().reset_index()
    assert conteo['MES'].nunique() == 1, f'{ruta.name}: más de un mes {conteo["MES"].unique()}'
    return conteo


def rango_edad(etiqueta):
    """'05 a 09 años' -> (5, 9); '80 a más años' / 'Más de 99 años' -> (80, None) / (100, None); sin dato -> None."""
    t = normalizar(etiqueta)
    if m := re.fullmatch(r'(\d+) A (\d+) ANOS', t):
        return int(m[1]), int(m[2])
    if m := re.fullmatch(r'(\d+) A MAS ANOS', t):
        return int(m[1]), None
    if m := re.fullmatch(r'MAS DE (\d+) ANOS', t):
        return int(m[1]) + 1, None
    assert t in {'S.I.', 'SIN INFORMACION'}, f'Tramo de edad no reconocido: {etiqueta!r}'
    return None


def tramo(edad):
    for i, etiqueta in enumerate(ETIQUETAS_TRAMO):
        if BINS_TRAMO[i] <= edad < BINS_TRAMO[i + 1]:
            return etiqueta
    raise ValueError(edad)


def armonizar(conteos):
    """conteos: {anio: DataFrame de contar_zip}. Devuelve la tabla final por CUT, sexo y tramo del proyecto."""
    ref = conteos[2019][['COD_COMUNA', 'COMUNA']].drop_duplicates()
    cut_por_nombre = {normalizar(n): c for c, n in ref.values if c not in ('', '0')}

    filas = []
    for anio, d in conteos.items():
        d = d.copy()
        if d['COD_COMUNA'].ne('').any():
            d['CUT'] = d['COD_COMUNA'].where(~d['COD_COMUNA'].isin(['', '0'])).str.zfill(5)
        else:
            nombres = d['COMUNA'].map(normalizar)
            desconocidas = nombres.isin(['', 'DESCONOCIDA'])
            faltan = set(nombres[~desconocidas & ~nombres.isin(cut_por_nombre)])
            assert not faltan, f'{anio}: comunas sin CUT {faltan}'
            d['CUT'] = nombres.map(cut_por_nombre).where(~desconocidas)
        d['SEXO'] = d['SEXO'].map(normalizar).map({'HOMBRE': 'HOMBRE', 'MUJER': 'MUJER'}).fillna('DESCONOCIDO')
        d['RANGO'] = d['EDAD_TRAMO'].map(rango_edad)
        d['ANIO'] = anio
        filas.append(d[['ANIO', 'CUT', 'SEXO', 'RANGO', 'N']])
    todo = pd.concat(filas, ignore_index=True)
    todo['COD_REGION'] = todo['CUT'].str[:2]

    # Proporción del sub-grupo inferior en cada grupo de 10 años, desde 2021 y 2024 (grupos de 5 años)
    cinco = todo[todo['ANIO'].isin([2021, 2024]) & todo['RANGO'].notna()].copy()
    cinco['INICIO'] = cinco['RANGO'].map(lambda r: r[0])
    proporciones = {}
    for (desde, hasta), corte in GRUPOS_A_REPARTIR.items():
        en_grupo = cinco[cinco['INICIO'].between(desde, hasta)]
        inferior = en_grupo[en_grupo['INICIO'] < corte]
        for nivel in (['CUT', 'SEXO'], ['COD_REGION', 'SEXO'], ['SEXO']):
            total = en_grupo.groupby(nivel, dropna=False)['N'].sum()
            proporciones[(desde, tuple(nivel))] = (inferior.groupby(nivel, dropna=False)['N'].sum().reindex(total.index, fill_value=0) / total).where(total > 0)

    def proporcion(fila, desde):
        for nivel in (['CUT', 'SEXO'], ['COD_REGION', 'SEXO'], ['SEXO']):
            clave = tuple(fila[c] for c in nivel) if len(nivel) > 1 else fila[nivel[0]]
            valor = proporciones[(desde, tuple(nivel))].get(clave)
            if valor is not None and pd.notna(valor):
                return valor
        raise ValueError(f'Sin proporción para {fila.to_dict()}')

    salida = []
    for fila in todo.itertuples(index=False):
        base = {'ANIO': fila.ANIO, 'CUT': fila.CUT, 'COD_REGION': fila.COD_REGION, 'SEXO': fila.SEXO}
        if not isinstance(fila.RANGO, tuple):
            salida.append({**base, 'TRAMO_EDAD': 'DESCONOCIDO', 'POBLACION': fila.N, 'ESTIMADO': False})
            continue
        desde, hasta = fila.RANGO
        if (desde, hasta) in GRUPOS_A_REPARTIR:
            corte = GRUPOS_A_REPARTIR[(desde, hasta)]
            p = proporcion(pd.Series(base), desde)
            salida.append({**base, 'TRAMO_EDAD': tramo(desde), 'POBLACION': fila.N * p, 'ESTIMADO': True})
            salida.append({**base, 'TRAMO_EDAD': tramo(corte), 'POBLACION': fila.N * (1 - p), 'ESTIMADO': True})
            continue
        assert hasta is None or tramo(desde) == tramo(hasta), f'Grupo {fila.RANGO} cruza un tramo y no se reparte'
        salida.append({**base, 'TRAMO_EDAD': tramo(desde), 'POBLACION': fila.N, 'ESTIMADO': False})

    tabla = (pd.DataFrame(salida)
             .groupby(['ANIO', 'CUT', 'COD_REGION', 'SEXO', 'TRAMO_EDAD'], dropna=False)
             .agg(POBLACION=('POBLACION', 'sum'), ESTIMADO=('ESTIMADO', 'any')).reset_index())
    # La suma por año debe ser exactamente el total de personas del archivo
    for anio, d in conteos.items():
        assert abs(tabla.loc[tabla['ANIO'] == anio, 'POBLACION'].sum() - d['N'].sum()) < 1e-3, anio
    return tabla


def main():
    conteos = {}
    for ruta in sorted(ORIGEN.glob('Base Beneficiarios *.zip')):
        anio = int(ruta.stem.split()[-1])
        conteos[anio] = contar_zip(ruta)
        print(f'{anio}: {conteos[anio]["N"].sum():,} beneficiarios (mes {conteos[anio]["MES"].iloc[0]})', flush=True)
    assert sorted(conteos) == list(range(2019, 2025)), sorted(conteos)
    tabla = armonizar(conteos)
    tabla.to_csv(SALIDA, index=False, encoding='utf-8', float_format='%.3f')
    print(f'Escrito {SALIDA} ({len(tabla):,} filas)')


if __name__ == '__main__':
    sys.exit(main())
