cmake_minimum_required(VERSION 3.22)
project(asagi_brain C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Temporarily disabled: engine (llama.cpp + asagi_engine.cpp) removed.
# Re-enable when the local native engine build is green.
# llama.cpp fixed tag and SHA256 verify: never latest.
# v0.7.0 release 2026-10-15.
# set(LLAMA_CPP_URL "https://github.com/ggml-org/llama.cpp/archive/refs/tags/v0.7.0.tar.gz")
# set(LLAMA_CPP_SHA256 "55d67acf3ad2ad747a9bbeb75f9f0e173dbcc0d1753a471038a90c819421c5e1")
#
# include(FetchContent)
# FetchContent_Declare(llama_cpp
#     URL ${LLAMA_CPP_URL}
#     URL_HASH SHA256=${LLAMA_CPP_SHA256}
# )
#
# # Full llama.cpp build, only the inference library (no tests, examples, server,
# # tools, curl, OpenMP).
# set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
# set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
# set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
# set(LLAMA_BUILD_TOOLS    OFF CACHE BOOL "" FORCE)
# set(LLAMA_BUILD_COMMON   OFF CACHE BOOL "" FORCE)
# set(LLAMA_CURL           OFF CACHE BOOL "" FORCE)
# set(GGML_CURL            OFF CACHE BOOL "" FORCE)
# set(GGML_OPENMP          OFF CACHE BOOL "" FORCE)
# set(BUILD_SHARED_LIBS    OFF CACHE BOOL "" FORCE)
#
# FetchContent_MakeAvailable(llama_cpp)
#
# add_library(asagi_brain SHARED
#     asagi_engine.cpp
#     asagi_jni.cpp
# )
#
# target_include_directories(asagi_brain PRIVATE
#     ${llama_cpp_SOURCE_DIR}/include
#     ${llama_cpp_SOURCE_DIR}/ggml/include
# )
#
# target_link_libraries(asagi_brain
#     PRIVATE
#     llama
#     log
#     android
# )

# Motor nativo temporalmente deshabilitado (fase 2). Solo el JNI stub se
# compila; el .so no expone asagi_load/unload ni generate.
add_library(asagi_brain SHARED
    asagi_jni.cpp
)

target_link_libraries(asagi_brain PRIVATE)
