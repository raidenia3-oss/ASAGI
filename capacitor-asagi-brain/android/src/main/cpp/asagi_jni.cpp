#include <jni.h>

#include <string>

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeLoadModel(JNIEnv *env, jclass, jstring) {
    return env->NewStringUTF("Motor nativo no disponible en esta versión");
}

JNIEXPORT void JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeUnload(JNIEnv *, jclass) {
}

JNIEXPORT jboolean JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeIsLoaded(JNIEnv *, jclass) {
    return JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_com_asagi_brain_AsgiBrainPlugin_nativeGenerate(JNIEnv *, jclass, jobjectArray, jobjectArray, jint) {
    return env->NewStringUTF("Motor nativo no disponible en esta versión");
}

}  // extern "C"
