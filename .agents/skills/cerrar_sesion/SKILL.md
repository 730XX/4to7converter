---
name: cerrar_sesion
description: Protocolo exhaustivo para cierre de sesión de desarrollo, auditoría multicapa frente a HEAD, cálculo determinista de SemVer, actualización sincronizada de versiones en Tauri/Rust/Node, redacción técnica del CHANGELOG.md y generación de Conventional Commits.
---

# Protocolo Maestro: Cerrar Sesión & Release Workflow

Este protocolo establece los pasos deterministas y exhaustivos que el agente DEBE seguir para auditar, versionar, documentar y preparar el commit de cierre de una sesión de trabajo.

---

## FASE 1: Auditoría Multicapa de Cambios (Head Inspection)

El agente no debe asumir nada; debe inspeccionar el estado real del repositorio mediante comandos de lectura y análisis de diffs.

### 1.1 Ejecución de diagnósticos del repositorio
Ejecutar secuencialmente para obtener el panorama completo:
1. `git status --porcelain` (para detectar archivos modificados, agregados `??` o eliminados `D`).
2. `git diff HEAD` (para auditar todas las alteraciones línea por línea).
3. Si el diff es muy extenso, segmentar la lectura por subsistemas.

### 1.2 Mapeo y Clasificación por Dominio Arquitectónico
Clasificar cada cambio dentro de una de las capas del sistema:

| Capa del Stack | Rutas Clave | Naturaleza del Cambio |
|---|---|---|
| **Core / Engine** | `src/core/` | Algoritmos de conversión, parser/serializer `.osu`, estructuras de datos. |
| **Native Backend (Rust / Tauri)** | `app/src-tauri/src/` | Comandos Tauri, escáner de memoria, caché en RAM, I/O de disco, splash. |
| **Audio & Sync Engine** | `app/src/lib/audio.ts`, `use-playback.ts` | Hitsounds, curvas de volumen, escalamiento de acordes, sincronización. |
| **UI Components & HUD** | `app/src/components/`, `app/src/preview/` | Modales, timeline canvas, OSD toasts, drawers, animaciones. |
| **Design System & Styles** | `app/src/styles/` | CSS variables, animaciones keyframes, temas, micro-interacciones. |
| **Configuración & Infra** | `package.json`, `Cargo.toml`, `tauri.conf.json` | Dependencias, flags de compilación, metadata. |

---

## FASE 2: Matriz Determinista de Decisión SemVer

El agente debe determinar la nueva versión siguiendo estrictamente [Semantic Versioning 2.0.0](https://semver.org/):

```
Versión: MAJOR . MINOR . PATCH
```

### Reglas de cálculo:
- **MAJOR (`X.0.0`)**: Cambios de arquitectura incompatibles con versiones previas (breaking changes en el formato de salida o configuración de mapeo).
- **MINOR (`x.Y.0`)**: 
  - Nuevas funcionalidades visibles para el usuario (ej. Kiai Track en el timeline, búsqueda indexada en RAM, presets guardables, nuevos filtros).
  - Si la versión previa era `0.2.0`, la nueva versión será `0.3.0`.
- **PATCH (`x.y.Z`)**:
  - Exclusivamente correcciones de bugs, ajustes de color/estilo o refactors internos sin nuevas features.
  - Si la versión previa era `0.2.0`, la nueva versión será `0.2.1`.

### Sincronización Mandatoria de Archivos
Una vez definida la nueva versión `X.Y.Z`, se deben actualizar simultáneamente:
1. `package.json` (raíz): `"version": "X.Y.Z"`
2. `app/package.json` (si existe): `"version": "X.Y.Z"`
3. `app/src-tauri/Cargo.toml`: `[package] \n version = "X.Y.Z"`
4. `app/src-tauri/tauri.conf.json`: `"version": "X.Y.Z"`

*Nota: Verificar que todas las versiones coincidan exactamente sin discrepancias.*

---

## FASE 3: Redacción Técnica en `CHANGELOG.md`

Insertar la nueva versión en la parte superior del archivo `CHANGELOG.md`, respetando la estructura estándar de [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/):

```markdown
## [X.Y.Z] - AAAA-MM-DD

### Añadido
- **Nombre de la Feature**:
  - Detalle técnico del funcionamiento y alcance.
  - Beneficio directo para el usuario o flujo de trabajo.

### Optimizado / Rendimiento
- **Nombre de la Optimización**:
  - Explicación de la arquitectura anterior vs la nueva (ej. I/O en disco vs RAM Cache).
  - Métricas o reducción de latencia lograda (ej. de 3-4s a <5ms).

### Corregido
- **Descripción del Bug**:
  - Causa raíz del problema corregido.
  - Comportamiento esperado implementado.

### Experiencia de Usuario (UI/UX)
- **Ajustes visuales y de interacción**:
  - Transiciones de entrada y salida (`is-closing`).
  - Paletas de colores, contraste y ajustes de navegación por teclado.
```

### Reglas de Calidad para el Changelog:
- No usar descripciones genéricas como *"mejoras varias"* o *"fixes menores"*.
- Explicar **qué** se hizo y **por qué** es relevante.
- Usar viñetas anidadas para dar contexto profundo a cambios complejos.

---

## FASE 4: Propuesta Estructurada de Conventional Commits

El agente DEBE proponer los commits estructurados sin ejecutar `git commit` ni `git push` automáticamente (salvo que el usuario dé la orden explícita).

### Estructura de Propuesta:

#### Opción 1: Release Unificado (Recomendada para cierre de sesión)
```bash
git add .
git commit -m "chore(release): bump vX.Y.Z y actualizar changelog

- feat(search): optimización masiva de búsqueda con índice en RAM (<5ms)
- feat(timeline): detección y visualización de Kiai Time con pista dedicada
- ui(transitions): animaciones de salida reversas para OSD toasts y modal de búsqueda
- perf(audio): escalamiento gradual de volumen en acordes para evitar saturación"
```

#### Opción 2: Commits Atómicos por Capa
Proponer la secuencia de commits si el usuario prefiere un historial granular:
```bash
# 1. Backend & Performance
git add app/src-tauri/
git commit -m "perf(search): implementar índice en memoria para búsqueda instantánea de beatmaps"

# 2. Frontend & Timeline
git add app/src/components/PlaybackFooter.tsx app/src/styles/
git commit -m "feat(timeline): incorporar track de Kiai Time y actualizar paleta de densidad"

# 3. Release & Metadata
git add CHANGELOG.md package.json app/src-tauri/Cargo.toml app/src-tauri/tauri.conf.json
git commit -m "chore(release): bump vX.Y.Z"
```

#### Publicación Automática de Release (GitHub Actions)
Una vez hecho el commit y push a `main`, proponer la creación del tag para disparar el flujo de compilación y publicación de instaladores en GitHub:
```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```
*Esto activará el workflow `.github/workflows/release.yml`, el cual compila los instaladores (`.exe`, `.msi`) y publica el release con el changelog de forma 100% automatizada.*

---

## Criterios de Éxito de la Ejecución
- [ ] Todos los archivos modificados en la sesión están identificados y justificados.
- [ ] Las versiones en `Cargo.toml`, `package.json` y `tauri.conf.json` están 100% sincronizadas.
- [ ] El `CHANGELOG.md` contiene explicaciones técnicas precisas organizadas por categorías.
- [ ] Se proporcionan comandos listos para copiar con formato Conventional Commits impecable.
- [ ] Se incluye el comando de creación de tag (`git tag vX.Y.Z && git push origin vX.Y.Z`) para la publicación automática.
