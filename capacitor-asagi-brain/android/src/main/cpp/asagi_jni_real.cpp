#include <jni.h>

#include <string>
#include <vector>

#include "asagi_engine.h"

// Puente JNI REAL del motor (asagi_engine.cpp + llama.cpp).
// asagi_jni.cpp es el stub que usa el APK mientras el motor siga desactivado
// en el CMake de Android; este archivo es el que compila la build nativa del
// dispositivo (ver native/termux/CMakeLists.txt).
// No usa <android/log.h>: así también compila y se puede probar en el host.

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
        m.role = toStd(env, static_cast<jstring>(env->GetObjectArrayElement(roles, i)));
        m.content = toStd(env, static_cast<jstring>(env->GetObjectArrayElement(contents, i)));
        out.push_back(std::move(m));
    }
    return true;
}

}  // namespace

extern "C" {

// "" = OK; si no, error legible en español.
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

// Devuelve la respuesta completa (sin bloques de razonamiento) o, si algo
// falló, el mensaje de error legible. Nunca lanza ni aborta.
JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsagiBrainPlugin_nativeGenerate(JNIEnv *env, jclass, jobjectArray jroles,
                                                    jobjectArray jcontents, jint jmaxTokens) {
    std::vector<asagi::Message> messages;
    if (!readMessages(env, jroles, jcontents, messages) || messages.empty()) {
        return env->NewStringUTF("Los mensajes no tienen la forma esperada (role + content).");
    }

    const asagi::GenerateResult result =
        asagi::Engine::instance().generate(messages, jmaxTokens, nullptr);

    if (!result.ok) {
        return env->NewStringUTF(result.error.empty() ? "El motor local falló sin detalle."
                                                      : result.error.c_str());
    }
    return env->NewStringUTF(result.text.c_str());
}

}  // extern "C"
