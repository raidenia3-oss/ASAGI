#include "asagi_engine.h"

#include "llama.h"

#include <chrono>
#include <cstring>

namespace asagi {

namespace {

long long nowMs() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

// Evita inicializar el backend dos veces aunque se llame desde varios hilos.
void ensureBackendInit() {
    static std::once_flag once;
    std::call_once(once, [] { llama_backend_init(); });
}

}  // namespace

std::string stripThink(const std::string &text) {
    std::string out = text;

    // Bloques de razonamiento en valla (````think ... ``` y ```think_stream ... ```)
    for (size_t p = out.find("```think"); p != std::string::npos; p = out.find("```think")) {
        const size_t close = out.find("```", p + 8);
        out.erase(p, close == std::string::npos ? std::string::npos : (close + 3 - p));
    }

    // Etiquetas de razonamiento de Qwen3 (apertura y cierre, armadas por
    // concatenación para no escribirlas literales en el fuente).
    // Con o sin cierre: si no hay cierre, se descarta todo lo que sigue.
    const std::string kOpen = std::string("<") + "think" + ">";
    const std::string kClose = std::string("<") + "/" + "think" + ">";
    for (size_t p = out.find(kOpen); p != std::string::npos; p = out.find(kOpen)) {
        const size_t close = out.find(kClose, p + kOpen.size());
        out.erase(p, close == std::string::npos
                         ? std::string::npos
                         : (close + kClose.size() - p));
    }

    // Cierres sueltos (sin apertura previa) que dejaría el recorte por contexto.
    for (size_t p = out.find(kClose); p != std::string::npos; p = out.find(kClose)) {
        out.erase(p, kClose.size());
    }

    return out;
}

Engine &Engine::instance() {
    static Engine engine;
    return engine;
}

std::string Engine::load(const std::string &modelPath) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (ctx_ != nullptr && model_ != nullptr) {
        return "";  // ya cargado
    }

    ensureBackendInit();

    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;  // CPU puro: sin GPU en el flujo local

    model_ = llama_model_load_from_file(modelPath.c_str(), mp);
    if (model_ == nullptr) {
        return "No se pudo abrir el modelo (¿la descarga está incompleta? Prueba a descargarlo de nuevo).";
    }

    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = kMaxContext;
    cp.n_batch = kMaxContext;
    cp.n_threads = kThreads;
    cp.n_threads_batch = kThreads;

    ctx_ = llama_init_from_model(model_, cp);
    if (ctx_ == nullptr) {
        llama_model_free(model_);
        model_ = nullptr;
        return "No se pudo crear el contexto de inferencia con 2048 tokens.";
    }

    return "";
}

void Engine::unload() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (ctx_ != nullptr) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_ != nullptr) {
        llama_model_free(model_);
        model_ = nullptr;
    }
}

bool Engine::loaded() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return ctx_ != nullptr && model_ != nullptr;
}

GenerateResult Engine::generate(const std::vector<Message> &messages, int maxTokens,
                                const std::function<void(const std::string &)> &onToken) {
    GenerateResult result;
    std::lock_guard<std::mutex> lock(mutex_);

    if (ctx_ == nullptr || model_ == nullptr) {
        result.error = "El modelo no está cargado.";
        return result;
    }
    if (messages.empty()) {
        result.error = "No hay mensajes que procesar.";
        return result;
    }
    if (maxTokens < 1) {
        maxTokens = 1;
    }
    if (maxTokens > kMaxTokensAnswer) {
        maxTokens = kMaxTokensAnswer;  // tope duro por requisito
    }

    const long long start = nowMs();
    const llama_vocab *vocab = llama_model_get_vocab(model_);
    if (vocab == nullptr) {
        result.error = "El modelo no incluye vocabulario.";
        return result;
    }

    // Plantilla de chat del propio modelo (Qwen3).
    const char *tmpl = llama_model_chat_template(model_, nullptr);
    if (tmpl == nullptr || tmpl[0] == '\0') {
        result.error = "El modelo no incluye plantilla de chat.";
        return result;
    }

    // /no_think en el último mensaje de usuario: la plantilla de Qwen3 así
    // desactiva el modo razonamiento y responde directamente.
    std::vector<std::string> contents;
    contents.reserve(messages.size());
    for (size_t i = 0; i < messages.size(); ++i) {
        std::string c = messages[i].content;
        if (messages[i].role == "user" && i + 1 == messages.size()) {
            c += " /no_think";
        }
        contents.push_back(std::move(c));
    }

    std::vector<llama_chat_message> chat(messages.size());
    for (size_t i = 0; i < messages.size(); ++i) {
        chat[i].role = messages[i].role.c_str();
        chat[i].content = contents[i].c_str();
    }

    // Formato del prompt (dos pasadas: medir y rellenar).
    const int32_t needed = llama_chat_apply_template(tmpl, chat.data(), chat.size(), true, nullptr, 0);
    if (needed <= 0) {
        result.error = "No se pudo aplicar la plantilla de chat del modelo.";
        return result;
    }
    std::string prompt(static_cast<size_t>(needed) + 2, '\0');
    const int32_t written = llama_chat_apply_template(tmpl, chat.data(), chat.size(), true,
                                                      &prompt[0], needed + 1);
    if (written <= 0) {
        result.error = "No se pudo aplicar la plantilla de chat del modelo.";
        return result;
    }
    prompt.resize(static_cast<size_t>(written));

    // Qwen3: la plantilla deja abierto el turno del asistente. Se prefija un
    // bloque de razonamiento VACÍO para que responda directamente (sin
    // "thinking"), que es el switch fiable además de /no_think.
    prompt += "\n" + std::string("<") + "think" + ">" + "\n\n" + std::string("<") + "/" +
              "think" + ">" + "\n\n";

    // Tokenización (la plantilla incluye marcadores especiales: parse_special).
    std::vector<llama_token> toks(prompt.size() + 32);
    int32_t nPrompt = llama_tokenize(vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()),
                                     toks.data(), static_cast<int32_t>(toks.size()), false, true);
    if (nPrompt < 0) {
        toks.resize(static_cast<size_t>(-nPrompt) + 32);
        nPrompt = llama_tokenize(vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()),
                                 toks.data(), static_cast<int32_t>(toks.size()), false, true);
    }
    if (nPrompt < 0) {
        result.error = "No se pudo tokenizar el prompt.";
        return result;
    }

    // Reservar hueco para la respuesta y recortar por el frente si hace falta
    // (mantiene siempre los últimos mensajes; el contexto total es 2048).
    const int32_t room = kMaxContext - maxTokens - 8;
    if (nPrompt > room) {
        toks.erase(toks.begin(), toks.begin() + (nPrompt - room));
        nPrompt = static_cast<int32_t>(toks.size());
    }
    if (nPrompt < 1) {
        result.error = "El prompt queda sin tokens tras recortarlo al contexto.";
        return result;
    }

    // KV cache limpia para cada conversación.
    llama_memory_clear(llama_get_memory(ctx_), true);

    llama_batch batch = llama_batch_init(nPrompt, 0, 1);
    for (int32_t i = 0; i < nPrompt; ++i) {
        batch.token[i] = toks[static_cast<size_t>(i)];
        batch.pos[i] = i;
        batch.n_seq_id[i] = 1;
        batch.seq_id[i][0] = 0;
        batch.logits[i] = (i == nPrompt - 1) ? 1 : 0;
    }
    batch.n_tokens = nPrompt;

    int rc = llama_decode(ctx_, batch);
    if (rc != 0) {
        llama_batch_free(batch);
        result.error = "Fallo al procesar el prompt (código " + std::to_string(rc) + ").";
        return result;
    }

    // Cadena de muestreo: determinista en umbrales suaves para respuestas cortas.
    llama_sampler *smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.95f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    std::string raw;
    int32_t nPast = nPrompt;
    int gen = 0;
    llama_token tok = llama_sampler_sample(smpl, ctx_, -1);

    while (gen < maxTokens && !llama_vocab_is_eog(vocab, tok)) {
        char buf[512];
        int32_t len = llama_token_to_piece(vocab, tok, buf, static_cast<int32_t>(sizeof(buf)), 0, true);
        if (len < 0) {
            std::vector<char> big(static_cast<size_t>(-len));
            len = llama_token_to_piece(vocab, tok, big.data(), static_cast<int32_t>(big.size()), 0, true);
            if (len > 0) {
                raw.append(big.data(), static_cast<size_t>(len));
                if (onToken) {
                    onToken(std::string(big.data(), static_cast<size_t>(len)));
                }
            }
        } else if (len > 0) {
            raw.append(buf, static_cast<size_t>(len));
            if (onToken) {
                onToken(std::string(buf, static_cast<size_t>(len)));
            }
        }
        gen++;

        if (nPast >= kMaxContext) {
            result.truncated = true;
            break;
        }

        // Alimentar con el token recién muestreado (batch de 1).
        batch.n_tokens = 1;
        batch.token[0] = tok;
        batch.pos[0] = nPast;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = 1;
        rc = llama_decode(ctx_, batch);
        if (rc != 0) {
            result.truncated = true;
            break;
        }
        nPast++;

        tok = llama_sampler_sample(smpl, ctx_, -1);
    }

    llama_sampler_free(smpl);
    llama_batch_free(batch);

    result.ok = true;
    result.text = stripThink(raw);
    result.tokens = gen;
    result.ms = nowMs() - start;
    return result;
}

}  // namespace asagi
