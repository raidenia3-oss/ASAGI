# Build nativo del motor de ASAGI dentro del propio dispositivo (Termux, arm64).
# No es cross-compile: compila llama.cpp y el motor con el clang de Termux y
# ejecuta el test en el mismo celular.
#
# Variables obligatorias:
#   -DASAGI_ROOT=/ruta/al/repo
#   -DASAGI_CPP_DIR=/ruta/al/repo/capacitor-asagi-brain/android/src/main/cpp
#   -DASAGI_LLAMA_DIR=/ruta/a/llama.cpp-fuente
# Opcionales:
#   -DASAGI_WITH_JNI=ON|OFF          (por defecto ON; requiere jni.h)
#   -DASAGI_JNI_INCLUDE_DIR=/ruta    (carpeta que contiene jni.h)
#   -DASAGI_GGML_NATIVE=ON|OFF       (por defecto ON: -mcpu=native en el celular)

cmake_minimum_required(VERSION 3.20)
project(asagi_device C CXX)

foreach(required ASAGI_ROOT ASAGI_CPP_DIR ASAGI_LLAMA_DIR)
  if(NOT DEFINED ${required} OR "${${required}}" STREQUAL "")
    message(FATAL_ERROR "Falta -D${required}=<ruta>")
  endif()
endforeach()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

option(ASAGI_WITH_JNI "Compilar el puente JNI (requiere jni.h)" ON)
option(ASAGI_GGML_NATIVE "Optimizar para la CPU de este dispositivo" ON)

# --- llama.cpp: solo la librería de inferencia -----------------------------
set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON   OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL           OFF CACHE BOOL "" FORCE)
set(GGML_CURL            OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP          OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE          ${ASAGI_GGML_NATIVE} CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS    OFF CACHE BOOL "" FORCE)

add_subdirectory("${ASAGI_LLAMA_DIR}" "${CMAKE_BINARY_DIR}/llama.cpp" EXCLUDE_FROM_ALL)

# --- motor de ASAGI --------------------------------------------------------
add_library(asagi_engine STATIC "${ASAGI_CPP_DIR}/asagi_engine.cpp")
target_include_directories(asagi_engine PUBLIC
  "${ASAGI_CPP_DIR}"
  "${ASAGI_LLAMA_DIR}/include"
  "${ASAGI_LLAMA_DIR}/ggml/include"
)
target_link_libraries(asagi_engine PUBLIC llama)

# --- test ejecutable en el propio dispositivo ------------------------------
add_executable(host_test "${ASAGI_ROOT}/artifacts/host_test.cpp")
target_link_libraries(host_test PRIVATE asagi_engine)

# --- puente JNI (libasagi_brain.so) ---------------------------------------
if(ASAGI_WITH_JNI)
  add_library(asagi_brain SHARED "${ASAGI_CPP_DIR}/asagi_jni_real.cpp")
  target_link_libraries(asagi_brain PRIVATE asagi_engine)
  if(DEFINED ASAGI_JNI_INCLUDE_DIR AND NOT "${ASAGI_JNI_INCLUDE_DIR}" STREQUAL "")
    target_include_directories(asagi_brain PRIVATE "${ASAGI_JNI_INCLUDE_DIR}")
  endif()
endif()
