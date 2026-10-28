#include <jni.h>

#include <functional>
#include <string>
#include <vector>

#include "asagi_engine.h"

// Puente JNI REAL del motor (asagi_engine.cpp + llama.cpp v0.7.0).
// Compila dentro del APK (arm64-v8a) y también en el host/Termux.
// No usa <android/log.h>: así el mismo archivo sirve en las tres plataformas.
//
// Contrato con Java:
//   nativeLoadModel(path)  -> "" si OK, si no un mensaje legible en español.
//   nativeUnload()         -> libera modelo y contexto.
//   nativeIsLoaded()       -> true/false.
//   nativeGenerateResult() -> JSON {"ok":true,"text":…,"tokens":N,"ms":M}
//                             o    {"ok":false,"error":…}
//   nativeGenerateStream() -> igual, y además llama a
//                             AsagiBrainPlugin.onNativeToken(String) por token.

namespace {

std::string toStd(JNIEnv *env, jstring js) {
    if (js == nullptr) {
        return std::string();
    }
    const char *chars = env->GetStringUTFChars(js, nullptr);
    if (chars == nullptr) {
        return std::string();
    }
    std::string out(chars);
    env->ReleaseStringUTFChars(js, chars);
    return out;
}

bool readMessages(JNIEnv *env, jobjectArray roles, jobjectArray contents,
                  std::vector<asagi::Message> &out) {
    if (roles == nullptr || contents == nullptr) {
        return false;
    }
    const jsize n = env->GetArrayLength(roles);
    if (n != env->GetArrayLength(contents)) {
        return false;
    }
    out.clear();
    out.reserve(static_cast<size_t>(n));
    for (jsize i = 0; i < n; ++i) {
        asagi::Message m;
        jstring jrole = static_cast<jstring>(env->GetObjectArrayElement(roles, i));
        jstring jcontent = static_cast<jstring>(env->GetObjectArrayElement(contents, i));
        m.role = toStd(env, jrole);
        m.content = toStd(env, jcontent);
        if (jrole != nullptr) {
            env->DeleteLocalRef(jrole);
        }
        if (jcontent != nullptr) {
            env->DeleteLocalRef(jcontent);
        }
        out.push_back(std::move(m));
    }
    return true;
}

// Escapa un texto para incrustarlo en JSON.
std::string jsonEscape(const std::string &in) {
    std::string out;
    out.reserve(in.size() + 16);
    for (const unsigned char c : in) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

std::string resultJson(const asagi::GenerateResult &r) {
    std::string out = "{\"ok\":";
    out += r.ok ? "true" : "false";
    if (r.ok) {
        out += ",\"text\":\"" + jsonEscape(r.text) + "\"";
        out += ",\"tokens\":" + std::to_string(r.tokens);
        out += ",\"ms\":" + std::to_string(r.ms);
        out += r.truncated ? ",\"truncated\":true" : ",\"truncated\":false";
    } else {
        const std::string err =
            r.error.empty() ? "El motor local falló sin detalle." : r.error;
        out += ",\"error\":\"" + jsonEscape(err) + "\"";
    }
    out += "}";
    return out;
}

// Los tokens de llama.cpp son trozos de bytes: un acento puede quedar partido
// entre dos. Aquí se retienen las secuencias UTF-8 incompletas hasta que se
// completan, para que la app nunca muestre caracteres rotos.
class Utf8Chunker {
public:
    void push(const std::string &piece,
              const std::function<void(const std::string &)> &emit) {
        pending_ += piece;
        const size_t cut = completePrefix();
        if (cut > 0) {
            emit(pending_.substr(0, cut));
            pending_.erase(0, cut);
        }
    }

    void flush(const std::function<void(const std::string &)> &emit) {
        if (!pending_.empty()) {
            emit(pending_);
            pending_.clear();
        }
    }

private:
    size_t completePrefix() const {
        size_t i = 0;
        const size_t n = pending_.size();
        while (i < n) {
            const unsigned char c = static_cast<unsigned char>(pending_[i]);
            size_t need = 1;
            if (c < 0x80) {
                need = 1;
            } else if ((c & 0xE0) == 0xC0) {
                need = 2;
            } else if ((c & 0xF0) == 0xE0) {
                need = 3;
            } else if ((c & 0xF8) == 0xF0) {
                need = 4;
            } else {
                ++i;  // byte inválido: se deja pasar tal cual
                continue;
            }
            if (i + need > n) {
                break;  // secuencia incompleta: esperar más bytes
            }
            i += need;
        }
        return i;
    }

    std::string pending_;
};

asagi::GenerateResult runGenerate(JNIEnv *env, jobjectArray jroles,
                                  jobjectArray jcontents, jint jmaxTokens,
                                  const std::function<void(const std::string &)> &onText) {
    std::vector<asagi::Message> messages;
    asagi::GenerateResult result;
    if (!readMessages(env, jroles, jcontents, messages) || messages.empty()) {
        result.ok = false;
        result.error = "Los mensajes no tienen la forma esperada (role + content).";
        return result;
    }
    return asagi::Engine::instance().generate(messages, jmaxTokens, onText);
}

}  // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeLoadModel(JNIEnv *env, jclass, jstring jpath) {
    const std::string path = toStd(env, jpath);
    const std::string err = asagi::Engine::instance().load(path);
    return env->NewStringUTF(err.c_str());
}

JNIEXPORT void JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeUnload(JNIEnv *, jclass) {
    asagi::Engine::instance().unload();
}

JNIEXPORT jboolean JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeIsLoaded(JNIEnv *, jclass) {
    return asagi::Engine::instance().loaded() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeGenerateResult(JNIEnv *env, jclass,
                                                          jobjectArray jroles,
                                                          jobjectArray jcontents,
                                                          jint jmaxTokens) {
    const asagi::GenerateResult result = runGenerate(env, jroles, jcontents, jmaxTokens, nullptr);
    return env->NewStringUTF(resultJson(result).c_str());
}

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeGenerateStream(JNIEnv *env, jclass clazz,
                                                          jobjectArray jroles,
                                                          jobjectArray jcontents,
                                                          jint jmaxTokens) {
    // Se busca una sola vez por llamada el método estático de Java que recibe
    // los tokens (AsagiBrainPlugin.onNativeToken). Si no existe, se genera
    // igualmente sin streaming en vez de fallar.
    jmethodID emit = env->GetStaticMethodID(clazz, "onNativeToken", "(Ljava/lang/String;)V");
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        emit = nullptr;
    }

    Utf8Chunker chunker;
    const std::function<void(const std::string &)> push =
        [&](const std::string &piece) {
            if (emit == nullptr || piece.empty()) {
                return;
            }
            jstring js = env->NewStringUTF(piece.c_str());
            if (js == nullptr) {
                if (env->ExceptionCheck()) {
                    env->ExceptionClear();
                }
                return;
            }
            env->CallStaticVoidMethod(clazz, emit, js);
            env->DeleteLocalRef(js);
            if (env->ExceptionCheck()) {
                env->ExceptionClear();
            }
        };

    const asagi::GenerateResult result = runGenerate(
        env, jroles, jcontents, jmaxTokens,
        [&](const std::string &piece) { chunker.push(piece, push); });
    chunker.flush(push);

    return env->NewStringUTF(resultJson(result).c_str());
}

}  // extern "C"
