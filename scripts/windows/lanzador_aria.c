/* Reemplazo de la ARIA vieja (dist\ARIA OS.exe, copia congelada de septiembre).
   Ahora solo abre la ARIA NUEVA (ARIA_APP\aria_main.py con el Python del proyecto), sin consola.
   Al abrirse, la ARIA nueva arregla el arranque de Windows y manda este archivo a la Papelera. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
int WINAPI wWinMain(HINSTANCE a, HINSTANCE b, PWSTR c, int d) {
  wchar_t exe[MAX_PATH], aura[MAX_PATH], py[MAX_PATH], cmd[4096];
  GetModuleFileNameW(NULL, exe, MAX_PATH);
  wcscpy(aura, exe);
  for (int k = 0; k < 2; k++) { wchar_t *p = wcsrchr(aura, L'\\'); if (p) *p = 0; }   /* ...\AURA\dist\x.exe -> ...\AURA */
  swprintf(py, MAX_PATH, L"%ls\\.venv\\Scripts\\pythonw.exe", aura);
  if (GetFileAttributesW(py) == INVALID_FILE_ATTRIBUTES) wcscpy(py, L"pythonw.exe");
  swprintf(cmd, 4096, L"\"%ls\" -X utf8 -c \"import os,sys,runpy;os.makedirs(os.path.join('ARIA_APP','logs'),exist_ok=True);"
           L"f=open(os.path.join('ARIA_APP','logs','arranque.log'),'w',encoding='utf-8',buffering=1);sys.stdout=sys.stderr=f;"
           L"sys.argv=['aria_main.py'];runpy.run_path(os.path.join('ARIA_APP','aria_main.py'),run_name='__main__')\"", py);
  STARTUPINFOW si; PROCESS_INFORMATION pi; ZeroMemory(&si, sizeof si); si.cb = sizeof si; ZeroMemory(&pi, sizeof pi);
  if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, aura, &si, &pi)) { CloseHandle(pi.hProcess); CloseHandle(pi.hThread); return 0; }
  MessageBoxW(NULL, L"No encontre Python para abrir ARIA. Abre ARIA_APP\\ARIA_ABRIR.bat", L"ARIA", MB_OK);
  return 1;
}
