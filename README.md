<div align="center">

# 4to7 Mania
### Motor de conversión y editor visual de osu!mania 4K a 7K

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green?style=flat-square)](LICENSE)

<p align="center">
  Una herramienta de escritorio diseñada para convertir mapas de <b>osu!mania 4K a 7K</b> manteniendo el ritmo de la canción original y permitiendo personalizar los patrones para entrenar skillsets específicos.
</p>

</div>

---

## Por qué existe este proyecto

Cualquiera que juegue juegos de ritmo (VSRG) sabe que el conversor automático por defecto de osu! suele generar mapas en decadencia, llenos de patrones incómodos o asignaciones de notas poco naturales.

4to7 Mania puede darte el control total sobre cómo se reparten las notas de 4k en 7k. Puedes elegir dónde va cada nota, aplicar patrones de entrenamiento específicos (como stairs, trills o brackets) y ver el resultado en tiempo real en un canvas con audio sincronizado antes de exportar el mapa final a osu!.

Se que ya existen o existian programas pensados para cubrir este tema, pero nunca vi una que tenga una preview, o mas opcines para customizar el convertidor, como sea no soy el primero ni el ultimo.

---

## Características principales

### Mapeo visual de carriles
- **Asignación personalizada**: Puedes conectar cada carril del mapa 4K original a uno o varios carriles en el mapa 7K resultante.
- **Detección de colisiones**: Si asignas dos carriles distintos a una misma columna destino, la app te avisa visualmente para que sepas dónde se concentran las notas.
- **Presets de entrenamiento**: Incluye patrones predefinidos pensados para practicar habilidades concretas (`trills`, `mirror`, `staircase`, `Brackets` y `Blender`), además de permitirte guardar tus propias combinaciones.

### Filtros rápidos de conversión
- **Anti-Jack**: Evita que caigan notas consecutivas en la misma columna a intervalos de tiempo demasiado cortos, manteniendo el mapa fluido y jugable.
- **0 LN (Sin Long Notes)**: Convierte automáticamente todas las notas largas en notas simples, ideal si quieres practicar velocidad o streams puros.
- **Kiai Boost**: Aumenta de forma controlada la densidad del mapeo durante las partes más intensas de la canción (los momentos de Kiai).

### Vista previa interactiva en Canvas
- **Modo Split y 7K**: Compara el mapa 4K original al lado del 7K convertido en una sola pantalla, con anchos ajustados y barras divisorias claras.
- **Renderizado fluido**: Motor en Canvas 2D con aceleración por hardware que funciona a 60, 144 o 240+ FPS, con efectos de iluminación al golpear notas y velocidad de scroll configurable.
- **Selector de dificultades integrado**: Si la carpeta de la canción tiene varias dificultades, puedes cambiar entre ellas directamente desde el encabezado sin tener que volver a buscar el archivo.

### Audio y sincronización precisa
- **Reproducción con hitsounds**: Incluye efectos de sonido sintéticos sincronizados nota por nota con la música.
- **Navegación por rueda del ratón**: Puedes avanzar o retroceder en la canción usando la rueda del ratón de forma instantánea y sin que el audio se desfase de las notas.

### Detección automática de osu!
- **Escáner en memoria**: Si tienes osu! abierto en Windows, la aplicación detecta qué canción tienes seleccionada en el juego y te permite cargarla al instante con un solo clic.

---

## Atajos de teclado y controles

| Control | Acción |
| :--- | :--- |
| <kbd>Espacio</kbd> | Reproducir o pausar la canción |
| <kbd>Rueda Ratón ↑</kbd> | Retroceder en el mapa (`-250 ms`) |
| <kbd>Rueda Ratón ↓</kbd> | Adelantar en el mapa (`+250 ms`) |
| <kbd>Shift</kbd> + <kbd>Rueda</kbd> | Desplazamiento rápido (`±1000 ms`) |
| <kbd>Ctrl</kbd> + <kbd>Rueda</kbd> | Cambiar velocidad de scroll visual (`10` a `40`) |
| <kbd>Alt</kbd> + <kbd>Rueda</kbd> | Ajustar volumen de la música (`0%` a `100%`) |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Rueda</kbd> | Ajustar volumen de los hitsounds (`0%` a `100%`) |
| <kbd>Tab</kbd> | Alternar entre vista **Solo 7K** y **Split 4K/7K** |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Abrir o cerrar el panel de ajustes |


---

## Estructura del proyecto

El código está organizado como un monorepositorio con responsabilidades separadas:

```
4to7converter/
├── app/                          # Interfaz gráfica de escritorio (Tauri + React)
│   ├── src-tauri/                # Backend en Rust (acceso a disco y lectura de memoria de osu!)
│   └── src/
│       ├── components/           # Componentes visuales (cabecera, matriz de mapeo, playfield, etc.)
│       ├── lib/                  # Motores de audio, hitsounds, presets y comunicación nativa
│       ├── preview/              # Renderizado del mapa en Canvas 2D
│       └── styles/               # Estilos globales y tema visual
├── src/                          # Motor de conversión y CLI independiente
│   ├── core/
│   │   ├── convert/              # Lógica de conversión 4K a 7K y validación
│   │   └── osu/                  # Lector y generador de archivos .osu
│   └── cli/                      # Comando para terminal y scripts automatizados
└── tests/                        # Pruebas automatizadas de parser y motor
```

---

## Instalación y desarrollo

### Requisitos
- [Node.js](https://nodejs.org/) (versión 18 o superior)
- [Rust y Cargo](https://www.rust-lang.org/) (para compilar la aplicación de escritorio con Tauri)
- [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (requerido por Tauri en Windows)

### Pasos de instalación

1. Clona este repositorio:
```bash
git clone https://github.com/tu-usuario/4to7converter.git
cd 4to7converter
```

2. Instala las dependencias del proyecto y de la aplicación:
```bash
npm install
npm --prefix app install
```

3. Inicia la aplicación en modo desarrollo:
```bash
# Para abrir la app de escritorio completa con Tauri
npm run tauri:dev

# O si solo quieres probar la interfaz en el navegador
npm run dev:app
```

---

## Uso desde la terminal (CLI)

Si prefieres convertir mapas de forma directa o automática sin abrir la interfaz:

```bash
npx tsx src/cli/main.ts "ruta/al/mapa.osu" --output "ruta/al/resultado-7k.osu" --map "0:0,1:1,2:5,3:6"
```

---
