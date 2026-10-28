#include <jni.h>

// Stubs temporales: el motor nativo (llama.cpp) está deshabilitado en esta
// versión. Todos los métodos devuelven un error legible en vez de crashear.
// Ver CMakeLists.txt para reactivar el motor real.

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeLoadModel(JNIEnv *env, jclass, jstring jpath) {
    (void)jpath;
    return env->NewStringUTF("Motor nativo no disponible en esta versión");
}

JNIEXPORT void JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeUnload(JNIEnv *env, jclass) {
    (void)env;
}

JNIEXPORT jboolean JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeIsLoaded(JNIEnv *env, jclass) {
    (void)env;
    return JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeGenerate(JNIEnv *env, jclass, jobjectArray jroles,
                                                    jobjectArray jcontents, jint jmaxTokens) {
    (void)jroles;
    (void)jcontents;
    (void)jmaxTokens;
    return env->NewStringUTF("Motor nativo no disponible en esta versión");
}

}  // extern "C"
