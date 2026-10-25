#ifndef ASAGI_ENGINE_H
#define ASAGI_ENGINE_H

#include <functional>
#include <mutex>
#include <string>
#include <vector>

// Tipos opacos de llama.cpp (declarados en ámbito global para que, dentro del
// namespace, los punteros referencien a los tipos reales y no a otros nuevos).
struct llama_model;
struct llama_context;

namespace asagi {

// Parámetros fijos por requisito, pensados para un móvil de 4 GB de RAM.
constexpr int kMaxContext = 2048;     // tokens máximos de contexto
constexpr int kThreads = 4;           // hilos de inferencia
constexpr int kMaxTokensAnswer = 256; // tope de tokens por respuesta

struct Message {
    std::string role;    // "system" | "user" | "assistant"
    std::string content;
};

struct GenerateResult {
    bool ok = false;
    std::string error;   // mensaje legible en español
    std::string text;    // respuesta final SIN bloques de razonamiento
    int tokens = 0;
    long long ms = 0;
    bool truncated = false;  // se cortó por llegar al tope de contexto
};

// Elimina de la respuesta el razonamiento de Qwen3:
//  - bloques ```think ... ``` (y variantes ```think_stream ...)
//  - etiquetas  ...  (y un  sin cerrar: se descarta todo lo que siga)
std::string stripThink(const std::string &text);

class Engine {
public:
    static Engine &instance();

    // Carga el modelo (mmap) y crea el contexto. "" = OK; si no, error legible.
    // Se puede llamar repetidamente: si ya está cargado, no hace nada.
    std::string load(const std::string &modelPath);

    // Libera modelo y contexto (devuelve la memoria al sistema).
    void unload();

    bool loaded() const;

    // Bloqueante: debe correrse en un hilo de trabajo.
    // onToken recibe los trozos de texto a medida que se decodifican.
    GenerateResult generate(const std::vector<Message> &messages, int maxTokens,
                            const std::function<void(const std::string &)> &onToken);

private:
    Engine() = default;
    Engine(const Engine &) = delete;
    Engine &operator=(const Engine &) = delete;

    mutable std::mutex mutex_;
    ::llama_model *model_ = nullptr;
    ::llama_context *ctx_ = nullptr;
};

}  // namespace asagi

#endif  // ASAGI_ENGINE_H
