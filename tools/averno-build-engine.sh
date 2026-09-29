#!/usr/bin/env bash
# Compiles Chocolate Doom (Cloudflare's doom-wasm fork) to WebAssembly for Averno.
#
#   EMSDK=/path/to/emsdk tools/averno-build-engine.sh [workdir]
#
# Clones doom-wasm at a pinned commit, applies averno/engine/doom-wasm.patch and
# writes averno/engine/doom.js + doom.wasm and the plain JavaScript doom-asm.js.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${1:-${TMPDIR:-/tmp}/averno-engine}
COMMIT=65e0d3ae2ffa604155eebd96ed40da6567bd08f4
SRC=$WORK/doom-wasm
OUT=$ROOT/averno/engine

# shellcheck disable=SC1091
source "${EMSDK:?set EMSDK to your emsdk checkout}/emsdk_env.sh" >/dev/null

if [ ! -d "$SRC" ]; then
  git clone https://github.com/cloudflare/doom-wasm.git "$SRC"
  git -C "$SRC" checkout -q "$COMMIT"
  git -C "$SRC" apply "$OUT/doom-wasm.patch"
fi

BUILD=$WORK/build
mkdir -p "$BUILD/obj"
cat > "$BUILD/config.h" <<'H'
#define PACKAGE_NAME "Chocolate Doom"
#define PACKAGE_TARNAME "averno"
#define PACKAGE_VERSION "3.0.1"
#define PACKAGE_STRING "Chocolate Doom 3.0.1"
#define PROGRAM_PREFIX "chocolate-"
#define HAVE_DECL_STRCASECMP 1
#define HAVE_DECL_STRNCASECMP 1
#define HAVE_DIRENT_H 1
H

PORTS="-sUSE_SDL=2 -sUSE_SDL_MIXER=2 -sSDL2_MIXER_FORMATS=[] -sUSE_SDL_NET=2"

# Emscripten downloads its SDL ports as GitHub archives. Where those downloads are
# blocked, seed the port cache from git clones of the same tags instead.
PORTS_CACHE=$(em-config CACHE)/ports
seed_port() { # name repo tag subdir
  local dir=$PORTS_CACHE/$1 url=$2/archive/$3.zip
  [ "$(cat "$dir/.emscripten_url" 2>/dev/null)" = "$url" ] && return
  rm -rf "$dir" && mkdir -p "$dir"
  git clone -q --depth 1 -b "$3" "$2.git" "$dir/$4"
  echo "$url" > "$dir/.emscripten_url"
}
seed_port sdl2 https://github.com/libsdl-org/SDL release-2.30.9 SDL-release-2.30.9
seed_port sdl2_mixer https://github.com/libsdl-org/SDL_mixer release-2.8.0 SDL_mixer-release-2.8.0
seed_port sdl2_net https://github.com/emscripten-ports/SDL2_net version_2 SDL2_net-version_2
embuilder build sdl2 sdl2_mixer_none sdl2_net
CFLAGS="-O3 -DHAVE_CONFIG_H -I$BUILD -I$SRC/src -I$SRC/src/doom -I$SRC/textscreen -I$SRC/opl -I$SRC/pcsound $PORTS -Wno-everything"

SOURCES=$(cd "$SRC" && ls \
  src/i_main.c src/i_system.c src/m_argv.c src/m_misc.c \
  src/aes_prng.c src/d_event.c src/d_iwad.c src/d_loop.c src/d_mode.c src/deh_str.c src/gusconf.c \
  src/i_cdmus.c src/i_endoom.c src/i_glob.c src/i_input.c src/i_joystick.c src/i_midipipe.c \
  src/i_musicpack.c src/i_oplmusic.c src/i_pcsound.c src/i_sdlmusic.c src/i_sdlsound.c src/i_sound.c \
  src/i_timer.c src/i_video.c src/i_videohr.c src/midifile.c src/mus2mid.c src/m_bbox.c src/m_cheat.c \
  src/m_config.c src/m_controls.c src/m_fixed.c src/net_client.c src/net_common.c src/net_dedicated.c \
  src/net_gui.c src/net_io.c src/net_loop.c src/net_websockets.c src/net_packet.c src/net_petname.c \
  src/net_query.c src/net_server.c src/net_structrw.c src/sha1.c src/memio.c src/tables.c \
  src/v_diskicon.c src/v_video.c src/w_checksum.c src/w_main.c src/w_wad.c src/w_file.c \
  src/w_file_stdc.c src/w_file_posix.c src/w_file_win32.c src/w_merge.c src/z_zone.c \
  src/deh_io.c src/deh_main.c src/deh_mapping.c src/deh_text.c \
  src/doom/*.c textscreen/*.c opl/*.c pcsound/*.c)

OBJS=()
rm -f "$BUILD/failed"
for f in $SOURCES; do
  o=$BUILD/obj/$(echo "$f" | tr / _).o
  OBJS+=("$o")
  if [ ! -f "$o" ] || [ "$SRC/$f" -nt "$o" ]; then
    echo "  CC $f"
    { emcc $CFLAGS -c "$SRC/$f" -o "$o" || touch "$BUILD/failed"; } &
    while [ "$(jobs -r | wc -l)" -ge "$(nproc)" ]; do wait -n; done
  fi
done
wait
[ ! -f "$BUILD/failed" ] || { echo "compilation failed" >&2; exit 1; }

LDFLAGS=(-O3 $PORTS "${OBJS[@]}" \
  -lidbfs.js -lwebsocket.js \
  -sENVIRONMENT=web -sMODULARIZE=1 -sEXPORT_NAME=createDoom -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
  -sASYNCIFY -sASYNCIFY_STACK_SIZE=65536 -sSTACK_SIZE=4MB \
  -sINITIAL_MEMORY=96MB -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=_main,_web_key,_web_mouse_button,_web_mouse_move,_web_save_settings,_web_quit,_web_state \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain,IDBFS)

echo "  LD doom.js + doom.wasm"
emcc "${LDFLAGS[@]}" -o "$OUT/doom.js"
# Plain JavaScript build for pages whose content policy refuses WebAssembly.
echo "  LD doom-asm.js"
emcc "${LDFLAGS[@]}" -sWASM=0 -sEXPORT_NAME=createDoomAsm -o "$OUT/doom-asm.js"
ls -l "$OUT"/doom*
