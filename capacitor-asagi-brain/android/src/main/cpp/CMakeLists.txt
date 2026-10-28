cmake_minimum_required(VERSION 3.22)
project(asagi_brain C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# El NDK compila por defecto sin excepciones en algunos ajustes de AGP; llama.cpp
# usa excepciones en varias rutas (y std::function lanza std::bad_alloc), así que
# se habilitan explícitamente para todo el árbol (llama.cpp incluido).
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fexceptions")

# AGP compila el build debug como Debug (sin -O). ggml sin optimizar en un
# móvil de 4 GB es inutilizable: se mantiene -g pero con -O2.
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(CMAKE_C_FLAGS_DEBUG   "-O2 -g0")
    set(CMAKE_CXX_FLAGS_DEBUG "-O2 -g0")
endif()

# Sin tabla de símbolos en el .so que viaja en el APK: 50 MB -> ~6 MB.
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -s")

# --- llama.cpp: tag fijo + SHA256 (nunca "latest") -------------------------
# v0.7.0 (release 2026-10-15). La misma versión que compila Termux y el host.
set(LLAMA_CPP_URL "https://github.com/ggml-org/llama.cpp/archive/refs/tags/v0.7.0.tar.gz")
set(LLAMA_CPP_SHA256 "55d67acf3ad2ad747a9bbeb75f9f0e173dbcc0d1753a471038a90c819421c5e1")

include(FetchContent)
FetchContent_Declare(llama_cpp
    URL ${LLAMA_CPP_URL}
    URL_HASH SHA256=${LLAMA_CPP_SHA256}
)

# Solo la librería de inferencia: sin tests, ejemplos, servidor, herramientas,
# curl ni OpenMP. Menos tiempo de CI y menos tamaño.
set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON   OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL           OFF CACHE BOOL "" FORCE)
set(GGML_CURL            OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP          OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE          OFF CACHE BOOL "" FORCE)  # cross-compile: nunca -mcpu=native
set(BUILD_SHARED_LIBS    OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(llama_cpp)

# --- motor + puente JNI ----------------------------------------------------
add_library(asagi_brain SHARED
    asagi_engine.cpp
    asagi_jni.cpp
)

target_include_directories(asagi_brain PRIVATE
    ${llama_cpp_SOURCE_DIR}/include
    ${llama_cpp_SOURCE_DIR}/ggml/include
)

target_link_libraries(asagi_brain
    PRIVATE
    llama
    log
    android
)
