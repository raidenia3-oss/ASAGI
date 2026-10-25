#include <jni.h>

#include <string>
#include <vector>

#include "asagi_engine.h"

namespace {

// Callbacks hacia Java (com.asagi.brain.AsgiBrainPlugin).
jmethodID g_on_token = nullptr;
jmethodID g_on_done = nullptr;
jmethodID g_on_error = nullptr;

void resolveCallbacks(JNIEnv *env, jclass cls) {
    if (g_on_token != nullptr) {
        return;
    }
    g_on_token = env->GetStaticMethodID(cls, "onNativeToken", "(Ljava/lang/String;)V");
    g_on_done = env->GetStaticMethodID(cls, "onNativeDone", "(Ljava/lang/String;IJ)V");
    g_on_error = env->GetStaticMethodID(cls, "onNativeError", "(Ljava/lang/String;)V");
}

std::string toStdString(JNIEnv *env, jstring s) {
    if (s == nullptr) {
        return "";
    }
    const char *chars = env->GetStringUTFChars(s, nullptr);
    std::string out = chars != nullptr ? chars : "";
    if (chars != nullptr) {
        env->ReleaseStringUTFChars(s, chars);
    }
    return out;
}

}  // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeLoadModel(JNIEnv *env, jclass, jstring jpath) {
    const std::string err = asagi::Engine::instance().load(toStdString(env, jpath));
    return env->NewStringUTF(err.c_str());
}

JNIEXPORT void JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeUnload(JNIEnv *, jclass) {
    asagi::Engine::instance().unload();
}

JNIEXPORT jboolean JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeIsLoaded(JNIEnv *, jclass) {
    return asagi::Engine::instance().loaded() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeGenerate(JNIEnv *env, jclass cls,
                                                    jobjectArray jroles, jobjectArray jcontents,
                                                    jint jmaxTokens) {
    resolveCallbacks(env, cls);

    const jsize n = env->GetArrayLength(jroles);
    if (n == 0 || env->GetArrayLength(jcontents) != n) {
        return env->NewStringUTF("Lista de mensajes inválida.");
    }

    std::vector<asagi::Message> messages;
    messages.reserve(static_cast<size_t>(n));
    for (jsize i = 0; i < n; ++i) {
        auto jrole = static_cast<jstring>(env->GetObjectArrayElement(jroles, i));
        auto jcontent = static_cast<jstring>(env->GetObjectArrayElement(jcontents, i));
        asagi::Message m;
        m.role = toStdString(env, jrole);
        m.content = toStdString(env, jcontent);
        messages.push_back(std::move(m));
        if (jrole != nullptr) {
            env->DeleteLocalRef(jrole);
        }
        if (jcontent != nullptr) {
            env->DeleteLocalRef(jcontent);
        }
    }

    asagi::GenerateResult r = asagi::Engine::instance().generate(
        messages, static_cast<int>(jmaxTokens),
        [env, cls](const std::string &piece) {
            if (g_on_token != nullptr) {
                jstring jpiece = env->NewStringUTF(piece.c_str());
                env->CallStaticVoidMethod(cls, g_on_token, jpiece);
                if (jpiece != nullptr) {
                    env->DeleteLocalRef(jpiece);
                }
            }
        });

    if (!r.ok) {
        return env->NewStringUTF(r.error.c_str());
    }
    if (g_on_done != nullptr) {
        jstring jtext = env->NewStringUTF(r.text.c_str());
        env->CallStaticVoidMethod(cls, g_on_done, jtext, static_cast<jint>(r.tokens),
                                  static_cast<jlong>(r.ms));
        if (jtext != nullptr) {
            env->DeleteLocalRef(jtext);
        }
    }
    return env->NewStringUTF("");
}

}  // extern "C"
