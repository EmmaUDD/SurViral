# Frontend de Surviral

Explorador de hospitalizaciones respiratorias. Por defecto muestra los **datos GRD reales 2019–2024** (hospitalizaciones con diagnóstico principal J00–J99; sin cirugía mayor ambulatoria ni hospitalización diurna) generados por `Procesamiento/limpieza_basica_GRD.ipynb`. La demostración con datos ficticios sigue disponible con `npm run dev:simulated`.

## Datos reales

1. Ejecuta `Procesamiento/limpieza_basica_GRD.ipynb` completo: exporta `GRD_CIE_TM/GRD_limpio/grd_respiratorio_2019_2024.parquet`.
2. En `frontend/`, ejecuta `npm run prepare-data` (requiere Python con pandas y pyarrow). Genera, solo con `ES_HOSPITALIZACION = True`, `public/data/grd.bin` (~3,7 MB) y `public/data/grd-meta.json`, sin identificadores de pacientes ni hospitales.
3. Repite el paso 2 cada vez que cambie el parquet.

Para las **tasas por 100.000 beneficiarios** el paso 2 también lee `Procesamiento/poblacion_fonasa_2019_2024.csv`. Esa tabla se genera con `python Procesamiento/poblacion_fonasa.py` a partir de los zip de beneficiarios FONASA en `datos_grd/Fonasa/` (no versionados por su tamaño; ~1,3 GB). El numerador de las tasas usa solo los hospitales presentes todos los años (`HOSPITAL_EN_COHORTE`).

El navegador descarga esos dos archivos una vez y calcula todos los filtros localmente (`src/services/realAggregate.ts`). Territorio = comuna de residencia; tramos de edad = `TRAMO_EDAD` del notebook. La proporción sobre el total de egresos no es calculable porque las bases del proyecto solo contienen egresos respiratorios.

## Ejecutar en tu computador

Requisito: Node.js 22.12 o posterior; para ejecutar las pruebas de TypeScript sin herramientas adicionales se recomienda Node.js 24.

Abre una terminal en `frontend/`:

```sh
npm install # Solo la primera vez o si cambian las dependencias
npm run dev
```

- **Abrir:** http://127.0.0.1:5173/. Mantén la terminal abierta.
- **Apagar:** presiona `Ctrl + C` en esa terminal. Cerrar la pestaña no detiene el servidor.
- **Puerto 5173 ocupado:** ya hay un servidor activo. Usa el enlace o detén la instancia anterior antes de iniciar otra.

No se necesita backend: los datos reales se sirven como archivos estáticos desde `public/data/`. Para la demostración ficticia: `npm run dev:simulated`.

```sh
npm test
npm run build
npm run preview
```

La compilación crea `dist/`; para compartirla se debe servir esa carpeta mediante un servidor estático. No abrir `index.html` con doble clic: es una aplicación con módulos. El servidor de desarrollo solo escucha en este equipo por defecto.

## Alcance de esta entrega

- Panorama general: tres indicadores, serie mensual y ranking diagnóstico.
- Fechas inclusivas 2019–2024, región, edad, sexo y diagnóstico; selecciones visibles, limpieza y cancelación de consultas antiguas.
- Datos, gráficos y medianas calculados desde eventos ficticios individuales. Categorías desconocidas explícitas.
- Tabla accesible y descarga CSV de la serie, identificada como simulada.
- Vista de metodología y fuentes.
- Mapa interactivo de las 16 regiones en panorama y territorio, con islas en recuadros; geometría referencial sin territorio antártico.
- Territorio: mapa ampliable con 344 polígonos comunales, catálogo de 346 comunas, búsqueda y selección múltiple entre regiones; comparación, tabla y gráfico de líneas mensual por macrozona (5 macrozonas del Ministerio de Ciencia + Metropolitana), en tasa o conteo. Evolución: gráfico de líneas mes a mes con una línea por año (tasa o conteo) y modelo logístico. Perfil: edad, sexo y diagnósticos.
- Vacunación respiratoria: con datos simulados, serie mensual y comparación regional con filtros propios (campaña 2024/2025 y región); con datos GRD reales, solo el aviso de integración pendiente, sin mezclar cifras ficticias.
- Evolución temporal incluye una actividad logística funcional con datos ficticios: selector de los 12 meses posteriores al corte, filtros de región y comuna, probabilidad de superar un umbral mensual, evaluación temporal y corte de clasificación interactivo. Variables y método en `docs/ACTIVIDAD_REGRESION_LOGISTICA.txt`; pronóstico de cantidades reservado en `docs/IDEA_FUTURA_PRONOSTICO.txt`.

Fecha de referencia provisional: egreso. Geografía: residencia simulada. El filtro de diagnóstico solo modifica el numerador respiratorio del porcentaje. Estas definiciones deben validarse antes de conectar datos reales.

## Organización

- `src/app`: navegación y filtros compartidos.
- `src/screens`: composición de las pantallas.
- `src/components`: filtros, paneles, indicadores y estados reutilizables.
- `src/charts`: presentación de series y distribuciones.
- `src/services`: interfaz de acceso; punto único de sustitución en `index.ts`.
- `src/mocks`: eventos ficticios y agregaciones exclusivas de la demostración.
- `src/types`: contratos provisionales, valores ausentes y metadatos.
- `src/styles`: paleta y diseño adaptable.
- `src/utils`: presentación de fechas, números y descarga CSV.
- `tests`: coherencia de universos, filtros, ausentes y cancelación.
- `docs`: integración y catálogo de gráficos.

Todo el trabajo de frontend se mantiene dentro de esta carpeta. La limpieza real, clasificación diagnóstica y análisis estadístico definitivo pertenecen al equipo de datos y backend.

## Dependencias

React y TypeScript para componentes y contratos; Vite para desarrollo/compilación; Recharts para el gráfico mensual; Lucide para iconos. CSS propio, sin framework visual, sin servidor de datos simulado y sin biblioteca global de estado.

Catálogo territorial, simulación comunal y evaluación por horizonte: `docs/COMUNAS_Y_HORIZONTES.md`.
