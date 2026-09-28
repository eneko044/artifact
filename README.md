# Sector Polvo

Shooter táctico en 3D al estilo Counter-Strike que se juega en el navegador contra bots.
Construido con [three.js](https://threejs.org) y empaquetado como una única página HTML
más una carpeta de recursos.

## Qué incluye

- **Mapa desértico** con dos zonas (A y B), medio con puertas, túneles y "largo", generado
  sobre una rejilla de 2 m con texturas PBR y utilería de Poly Haven, cielo HDRI y sombras.
- **Bots** con el soldado animado de three.js (Idle/Walk/Run), pose de agachado, apuntado con
  el torso, muerte con caída y hitboxes por hueso (cabeza ×4, pecho, estómago, piernas).
- **Manos adaptadas a cada arma**: puntos de empuñadura, guardamanos y cargador medidos en cada
  modelo (`game/src/rigs.js`). IK analítica de dos huesos con vector polar para el codo,
  orientación de la palma y dedos curvados (índice en el gatillo). Los brazos en primera
  persona son el mismo soldado con la cabeza oculta.
- **Recarga animada** en primera persona y en los bots: el cargador real se separa de la malla
  del rifle (o se genera dentro de la empuñadura en pistolas y AWP), la mano izquierda lo saca,
  cae al suelo con física, trae uno nuevo, lo encaja y da el golpe final.
- **IA**: navegación A* con suavizado, rutas de ataque por zona, posiciones de defensa,
  visión con campo de visión y línea de vista, tiempo de reacción, ráfagas, contra-strafe,
  compensación de retroceso, oído (disparos y pasos) y avisos entre compañeros.
- **Armas**: cuchillo, USP-S, Glock-18, Desert Eagle, MP9, AK-47, M4A4, AWP con mira y granada
  HE. Dispersión por movimiento/salto/agachado, patrón de retroceso, caída de daño y
  penetración de blindaje.
- **Efectos de disparo**: fogonazos con varias formas y llamas laterales, luz que ilumina manos y
  arma, trazadoras que viajan, chispas en estela, fragmentos, polvo, humo del cañón caliente,
  casquillos (también de los bots), agujeros de bala, niebla y gotas de sangre, y golpe de
  cámara al disparar.
- **Rondas y economía**: tiempo de congelación y de compra, menú de compra, recompensas por
  baja, bonus por derrota acumulado, MVP, marcador (Tab) y fin de partido.
- **Sonido** sintetizado con WebAudio: disparos por arma, recargas, pasos posicionales con
  oclusión, silbido de balas, impactos, explosiones y reverberación exterior.
- **Modos**: equipo 5 contra 5 o solo contra 1–7 bots; cuatro dificultades; bando CT o T.

- **Apuntar con la mira (ADS)**: mantén el clic derecho y el arma se lleva a la cara alineando
  el alza y el punto de mira reales de cada modelo con el centro de la pantalla (punto tritio en
  el poste delantero). Zoom suave, sensibilidad proporcional, más precisión y paso más lento.
- **Movimiento realista**: inercia del arma al arrancar, frenar, girar y saltar; balanceo en ocho
  al andar; inclinación en desplazamientos laterales; respiración; el arma se recoge al pegarte
  a una pared; inspección (F); cabeceo e inclinación suaves de la cámara; sacudida al recibir
  impactos. Los bots mueven las piernas hacia donde caminan con el torso girado hacia su
  objetivo, retroceden andando hacia atrás, acusan los impactos y caen doblando las rodillas.

## Controles

WASD moverse · ratón apuntar/disparar · clic derecho apuntar con la mira (AWP: zoom, cuchillo: puñalada) · F inspeccionar · Espacio saltar ·
Ctrl/C agacharse · Shift caminar · R recargar · 1–4 y Q armas · B comprar · E/G recoger/soltar ·
Tab marcador · Esc pausa.

## Desarrollo

```bash
npm install
npm run build        # genera game/index.html (DEBUG=1 para no minificar)
cd game && python3 -m http.server 8765   # abrir http://localhost:8765/dev.html
```

- `game/src/` código del juego (módulos ES, empaquetados con esbuild).
- `game/assets/` modelos, texturas y HDRI (ya optimizados).
- `tools/fetch_polyhaven.py` descarga los recursos de Poly Haven; `tools/optimize.mjs` los
  recomprime; `tools/play.mjs` es un arnés headless para capturas y simulaciones.

## Créditos (CC0)

- Texturas, HDRI y utilería: [Poly Haven](https://polyhaven.com)
- Armas: [Ultimate Gun Pack de Quaternius](https://quaternius.com)
- Soldado animado: ejemplos de three.js (animaciones de Mixamo)
