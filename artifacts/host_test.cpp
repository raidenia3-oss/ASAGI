// Test nativo del motor de ASAGI en host x86_64 (misma asagi_engine.cpp que usa el JNI).
// Compila el mismo código que correrá en el móvil, solo que enlazando el llama.cpp
// del tag v0.7.0 compilado para el host.
#include "asagi_engine.h"

#include "llama.h"

#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using asagi::Engine;
using asagi::Message;

static int failures = 0;
static int total = 0;

static void check(bool ok, const std::string &label, const std::string &detail = "") {
    total++;
    if (ok) {
        printf("  ok   %s\n", label.c_str());
    } else {
        failures++;
        printf("  FAIL %s %s\n", label.c_str(), detail.c_str());
    }
}

static std::string readFile(const std::string &path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static long rssKb() {
    const std::string status = readFile("/proc/self/status");
    const size_t p = status.find("VmRSS:");
    if (p == std::string::npos) return -1;
    return std::atol(status.c_str() + p + 6);
}

int main(int argc, char **argv) {
    setvbuf(stdout, nullptr, _IONBF, 0);  // ver el progreso aunque se cuelgue
    const std::string modelPath = argc > 1 ? argv[1] : "";
    if (modelPath.empty()) {
        fprintf(stderr, "uso: host_test <modelo.gguf>\n");
        return 2;
    }

    printf("== 1. stripThink (unidades) ==\n");
    check(asagi::stripThink("Hola ```think\npienso cosas\n``` mundo") == "Hola  mundo",
          "valla ```think eliminada");
    check(asagi::stripThink("<pre>```think_stream\nx\n```fin") == "<pre>fin",
          "valla ```think_stream eliminada");
    const std::string openTag = std::string("<") + "re" + "sponse" + ">";
    const std::string closeTag = std::string("<") + "/" + "re" + "sponse" + ">";
    check(asagi::stripThink("A " + openTag + " B " + closeTag + "C") == "A C",
          "etiqueta de razonamiento eliminada");
    check(asagi::stripThink("x " + openTag + " respuesta sin cerrar") == "x ",
          "apertura sin cierre descarta el resto");
    check(asagi::stripThink("respuesta normal 1+1=2") == "respuesta normal 1+1=2",
          "texto normal intacto");

    printf("== 2. carga del modelo ==\n");
    const auto t0 = std::chrono::steady_clock::now();
    const std::string loadErr = Engine::instance().load(modelPath);
    const auto t1 = std::chrono::steady_clock::now();
    const long loadMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    check(loadErr.empty(), "modelo cargado", loadErr);
    check(Engine::instance().loaded(), "loaded() == true");
    printf("  info carga: %ld ms, RSS=%ld kB\n", loadMs, rssKb());

    printf("== 3. plantilla de chat del modelo ==\n");
    {
        llama_model_params mp = llama_model_default_params();
        mp.n_gpu_layers = 0;
        llama_model *m = llama_model_load_from_file(modelPath.c_str(), mp);
        check(m != nullptr, "segunda apertura (inspección)");
        if (m) {
            const char *tmpl = llama_model_chat_template(m, nullptr);
            check(tmpl != nullptr && tmpl[0] != '\0', "plantilla presente");
            if (tmpl) {
                const std::string t(tmpl);
                printf("  plantilla (%zu bytes): %.400s%s\n", t.size(), t.c_str(),
                       t.size() > 400 ? "..." : "");
                check(t.find("/no_think") != std::string::npos || t.find("no_think") != std::string::npos,
                      "la plantilla entiende /no_think");
                check(t.find("think") != std::string::npos, "la plantilla menciona thinking");
            }
            llama_model_free(m);
        }
    }

    printf("== 4. generación en streaming (256 tok. máx., 4 hilos) ==\n");
    std::vector<Message> msgs;
    msgs.push_back({"system", "Eres ASAGI, un asistente personal claro y breve. Responde en español."});
    msgs.push_back({"user", "Hola, ¿qué puedes hacer? Contéstame en una sola frase."});

    std::string streamed;
    int tokenCalls = 0;
    const auto g0 = std::chrono::steady_clock::now();
    asagi::GenerateResult r1 = Engine::instance().generate(
        msgs, 256, [&](const std::string &piece) { streamed += piece; tokenCalls++; });
    const auto g1 = std::chrono::steady_clock::now();
    const long g1ms = std::chrono::duration_cast<std::chrono::milliseconds>(g1 - g0).count();

    check(r1.ok, "generate ok", r1.error);
    check(r1.tokens > 0 && r1.tokens <= 256, "tokens entre 1 y 256", "tokens=" + std::to_string(r1.tokens));
    check(tokenCalls > 0, "se emitieron trozos en streaming", "llamadas=" + std::to_string(tokenCalls));
    check(!r1.text.empty(), "respuesta no vacía");
    check(asagi::stripThink(r1.text) == r1.text, "la respuesta final ya no contiene bloques think");
    printf("  respuesta: %s\n", r1.text.c_str());
    printf("  info: %d tokens en %ld ms (%.1f tok/s), llamadas=%d, RSS=%ld kB\n", r1.tokens, g1ms,
           g1ms > 0 ? r1.tokens * 1000.0 / g1ms : 0.0, tokenCalls, rssKb());

    printf("== 5. segunda pregunta (historial + KV limpio) ==\n");
    std::vector<Message> msgs2 = msgs;
    msgs2.push_back({"assistant", r1.text});
    msgs2.push_back({"user", "Repite exactamente la palabra ASAGI y nada más."});
    asagi::GenerateResult r2 = Engine::instance().generate(msgs2, 256, nullptr);
    check(r2.ok, "generate 2 ok", r2.error);
    check(r2.text.find("ASAGI") != std::string::npos, "respondió ASAGI", r2.text);
    check(r2.tokens <= 256, "tope 256 respetado en 2ª pasada");
    printf("  respuesta: %s\n", r2.text.c_str());

    printf("== 6. tope de contexto (prompt largo) ==\n");
    std::vector<Message> msgs3;
    msgs3.push_back({"system", "Eres ASAGI."});
    msgs3.push_back({"user", std::string(6000, 'a')});  // muy por encima de 2048 tokens
    asagi::GenerateResult r3 = Engine::instance().generate(msgs3, 256, nullptr);
    check(r3.ok, "prompt largo no rompe el motor", r3.error);
    printf("  info: tokens=%d truncado=%d\n", r3.tokens, r3.truncated ? 1 : 0);

    printf("== 7. descarga del modelo ==\n");
    Engine::instance().unload();
    check(!Engine::instance().loaded(), "loaded() == false tras unload");
    check(r1.ms <= 600000, "tiempos de generación razonables",
          "ms=" + std::to_string(r1.ms));

    printf("\n%d/%d comprobaciones OK\n", total - failures, total);
    return failures ? 1 : 0;
}
