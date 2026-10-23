// ============================================================================
// БУНКЕР «ЗАСЛОН-19»: ПЕПЕЛ УРАЛА — НАТИВНЫЙ WINDOWS .EXE КЛИЕНТ (Win32 + WebView2)
// Кастомная рамка окна в стиле бункера (без стандартного белого заголовка Windows),
// встроенная иконка (ID 101), кнопки Свернуть [—], Развернуть [□], Закрыть [✕],
// встроенный локальный сервер и 3D+2D движок игры.
// ============================================================================

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <objbase.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "WebView2.h"
#include "game_bundle.h"
#include "webview2_dll.h"

#define IDI_BUNKER_ICON 101
#define TITLEBAR_HEIGHT 36
#define BORDER_WIDTH    2

#define WM_USER_WINCMD     (WM_APP + 10)
#define WM_USER_WV2_FALLBK (WM_APP + 11)

enum WinCmdType {
  CMD_MINIMIZE = 1,
  CMD_MAXIMIZE = 2,
  CMD_CLOSE    = 3,
  CMD_DRAG     = 4
};

static HWND g_hwnd = NULL;
static HICON g_hIcon = NULL;
static int g_serverPort = 0;
static int g_hoverBtn = 0; // 0=none, 1=min, 2=max, 3=close, 4=launch_browser
static bool g_webviewReady = false;
static bool g_fallbackLaunched = false;
static ICoreWebView2Controller* g_wvController = NULL;
static ICoreWebView2* g_wvView = NULL;
static wchar_t g_tempDir[MAX_PATH] = {0};
static char g_serverUrlA[128] = {0};
static wchar_t g_serverUrlW[128] = {0};

// ============================================================================
// ВСТРОЕННЫЙ ЛОКАЛЬНЫЙ СЕРВЕР ИГРЫ (Winsock2 127.0.0.1)
// ============================================================================
static DWORD WINAPI GameHttpServerThread(LPVOID lpParam) {
  SOCKET listenSock = (SOCKET)(uintptr_t)lpParam;
  while (true) {
    SOCKET client = accept(listenSock, NULL, NULL);
    if (client == INVALID_SOCKET) break;

    char reqBuf[2048];
    int received = recv(client, reqBuf, sizeof(reqBuf) - 1, 0);
    if (received > 0) {
      reqBuf[received] = '\0';

      if (strstr(reqBuf, "/__win_cmd?act=min") != NULL) {
        PostMessageW(g_hwnd, WM_USER_WINCMD, CMD_MINIMIZE, 0);
        const char* resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
        send(client, resp, (int)strlen(resp), 0);
      } else if (strstr(reqBuf, "/__win_cmd?act=max") != NULL) {
        PostMessageW(g_hwnd, WM_USER_WINCMD, CMD_MAXIMIZE, 0);
        const char* resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
        send(client, resp, (int)strlen(resp), 0);
      } else if (strstr(reqBuf, "/__win_cmd?act=close") != NULL) {
        PostMessageW(g_hwnd, WM_USER_WINCMD, CMD_CLOSE, 0);
        const char* resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
        send(client, resp, (int)strlen(resp), 0);
      } else if (strstr(reqBuf, "/__win_cmd?act=drag") != NULL) {
        PostMessageW(g_hwnd, WM_USER_WINCMD, CMD_DRAG, 0);
        const char* resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
        send(client, resp, (int)strlen(resp), 0);
      } else {
        char header[256];
        int hLen = snprintf(
          header, sizeof(header),
          "HTTP/1.1 200 OK\r\n"
          "Content-Type: text/html; charset=utf-8\r\n"
          "Content-Length: %u\r\n"
          "Cache-Control: no-cache\r\n"
          "Connection: close\r\n\r\n",
          GAME_HTML_BUNDLE_len
        );
        send(client, header, hLen, 0);
        unsigned int sentTotal = 0;
        while (sentTotal < GAME_HTML_BUNDLE_len) {
          int chunk = (int)(GAME_HTML_BUNDLE_len - sentTotal);
          if (chunk > 65536) chunk = 65536;
          int s = send(client, (const char*)(GAME_HTML_BUNDLE + sentTotal), chunk, 0);
          if (s <= 0) break;
          sentTotal += (unsigned int)s;
        }
      }
    }
    closesocket(client);
  }
  return 0;
}

static bool StartLocalGameServer() {
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return false;

  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return false;

  sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = 0; // Ephemeral free port

  if (bind(s, (sockaddr*)&addr, sizeof(addr)) != 0) {
    closesocket(s);
    return false;
  }
  int namelen = sizeof(addr);
  getsockname(s, (sockaddr*)&addr, &namelen);
  g_serverPort = ntohs(addr.sin_port);

  if (listen(s, SOMAXCONN) != 0) {
    closesocket(s);
    return false;
  }

  snprintf(g_serverUrlA, sizeof(g_serverUrlA), "http://127.0.0.1:%d/", g_serverPort);
  swprintf(g_serverUrlW, 128, L"http://127.0.0.1:%d/", g_serverPort);

  CreateThread(NULL, 0, GameHttpServerThread, (LPVOID)(uintptr_t)s, 0, NULL);
  return true;
}

// ============================================================================
// ЗАПУСК EDGE / CHROME APP MODE (РЕЗЕРВНЫЙ РЕЖИМ ЕСЛИ НЕТ WEBVIEW2 RUNTIME)
// ============================================================================
static void LaunchFallbackAppWindow() {
  if (g_fallbackLaunched) return;
  g_fallbackLaunched = true;

  wchar_t args[256];
  swprintf(args, 256, L"--app=%s --window-size=1280,800", g_serverUrlW);
  HINSTANCE res = ShellExecuteW(NULL, L"open", L"msedge.exe", args, NULL, SW_SHOWNORMAL);
  if ((INT_PTR)res <= 32) {
    res = ShellExecuteW(NULL, L"open", L"chrome.exe", args, NULL, SW_SHOWNORMAL);
    if ((INT_PTR)res <= 32) {
      ShellExecuteW(NULL, L"open", g_serverUrlW, NULL, NULL, SW_SHOWNORMAL);
    }
  }
}

// ============================================================================
// WEBVIEW2 COM ОБРАБОТЧИКИ (ВСТРАИВАНИЕ 3D+2D ИГРЫ ВНУТРЬ КАСТОМНОГО ОКНА)
// ============================================================================
static void ResizeWebViewBounds(HWND hwnd) {
  if (!g_wvController) return;
  RECT rc;
  GetClientRect(hwnd, &rc);
  RECT wvRect;
  wvRect.left   = BORDER_WIDTH;
  wvRect.top    = TITLEBAR_HEIGHT;
  wvRect.right  = rc.right - BORDER_WIDTH;
  wvRect.bottom = rc.bottom - BORDER_WIDTH;
  if (wvRect.right < wvRect.left) wvRect.right = wvRect.left;
  if (wvRect.bottom < wvRect.top) wvRect.bottom = wvRect.top;
  g_wvController->put_Bounds(wvRect);
}

class ControllerCompletedHandler : public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler {
  ULONG m_ref = 1;
public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = this;
    AddRef();
    return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++m_ref; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG r = --m_ref;
    if (r == 0) delete this;
    return r;
  }
  HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Controller* controller) override {
    if (FAILED(result) || !controller) {
      PostMessageW(g_hwnd, WM_USER_WV2_FALLBK, 0, 0);
      return S_OK;
    }
    g_wvController = controller;
    g_wvController->AddRef();
    g_wvController->get_CoreWebView2(&g_wvView);
    if (g_wvView) {
      ICoreWebView2Settings* settings = NULL;
      if (SUCCEEDED(g_wvView->get_Settings(&settings)) && settings) {
        settings->put_IsScriptEnabled(TRUE);
        settings->put_AreDefaultScriptDialogsEnabled(TRUE);
        settings->put_IsWebMessageEnabled(TRUE);
        settings->Release();
      }
      ResizeWebViewBounds(g_hwnd);
      g_wvController->put_IsVisible(TRUE);
      wchar_t navUrl[160];
      swprintf(navUrl, 160, L"%s?native_exe=1", g_serverUrlW);
      g_wvView->Navigate(navUrl);
      g_webviewReady = true;
      InvalidateRect(g_hwnd, NULL, FALSE);
    }
    return S_OK;
  }
};

class EnvCompletedHandler : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler {
  ULONG m_ref = 1;
public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = this;
    AddRef();
    return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++m_ref; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG r = --m_ref;
    if (r == 0) delete this;
    return r;
  }
  HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Environment* env) override {
    if (FAILED(result) || !env) {
      PostMessageW(g_hwnd, WM_USER_WV2_FALLBK, 0, 0);
      return S_OK;
    }
    env->CreateCoreWebView2Controller(g_hwnd, new ControllerCompletedHandler());
    return S_OK;
  }
};

typedef HRESULT (STDMETHODCALLTYPE *PFN_CreateCoreWebView2EnvironmentWithOptions)(
  PCWSTR browserExecutableFolder,
  PCWSTR userDataFolder,
  ICoreWebView2EnvironmentOptions* environmentOptions,
  ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* environmentCreatedHandler
);

static void InitEmbeddedWebView2() {
  wchar_t tempBase[MAX_PATH];
  GetTempPathW(MAX_PATH, tempBase);
  swprintf(g_tempDir, MAX_PATH, L"%sZaslon19_Bunker", tempBase);
  CreateDirectoryW(g_tempDir, NULL);

  wchar_t dllPath[MAX_PATH];
  swprintf(dllPath, MAX_PATH, L"%s\\WebView2Loader.dll", g_tempDir);

  HANDLE hFile = CreateFileW(dllPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (hFile != INVALID_HANDLE_VALUE) {
    DWORD written = 0;
    WriteFile(hFile, WEBVIEW2_LOADER_DLL, WEBVIEW2_LOADER_DLL_len, &written, NULL);
    CloseHandle(hFile);
  }

  HMODULE hWv2 = LoadLibraryW(dllPath);
  if (!hWv2) hWv2 = LoadLibraryW(L"WebView2Loader.dll");
  if (!hWv2) {
    PostMessageW(g_hwnd, WM_USER_WV2_FALLBK, 0, 0);
    return;
  }

  PFN_CreateCoreWebView2EnvironmentWithOptions fnCreate =
    (PFN_CreateCoreWebView2EnvironmentWithOptions)GetProcAddress(
      hWv2, "CreateCoreWebView2EnvironmentWithOptions"
    );
  if (!fnCreate) {
    PostMessageW(g_hwnd, WM_USER_WV2_FALLBK, 0, 0);
    return;
  }

  wchar_t userDataDir[MAX_PATH];
  swprintf(userDataDir, MAX_PATH, L"%s\\UserData", g_tempDir);
  HRESULT hr = fnCreate(NULL, userDataDir, NULL, new EnvCompletedHandler());
  if (FAILED(hr)) {
    PostMessageW(g_hwnd, WM_USER_WV2_FALLBK, 0, 0);
  }
}

// ============================================================================
// ОТРИСОВКА КАСТОМНОЙ РАМКИ ОКНА БУНКЕРА (Win32 GDI)
// ============================================================================
static void GetTitlebarButtonRect(int clientW, int btnIdx, RECT* outRc) {
  // btnIdx: 1 = Minimize, 2 = Maximize, 3 = Close
  int btnW = 36;
  int btnH = 26;
  int top = 5;
  int rightMargin = 6;
  int idxFromRight = 3 - btnIdx; // close=0, max=1, min=2
  outRc->right  = clientW - rightMargin - idxFromRight * (btnW + 4);
  outRc->left   = outRc->right - btnW;
  outRc->top    = top;
  outRc->bottom = top + btnH;
}

static void PaintCustomBunkerWindow(HWND hwnd, HDC hdc) {
  RECT rc;
  GetClientRect(hwnd, &rc);
  int w = rc.right - rc.left;
  int h = rc.bottom - rc.top;

  HDC memDC = CreateCompatibleDC(hdc);
  HBITMAP memBmp = CreateCompatibleBitmap(hdc, w, h);
  HGDIOBJ oldBmp = SelectObject(memDC, memBmp);

  // 1. Dark bunker steel background (#0b110d)
  HBRUSH bgBrush = CreateSolidBrush(RGB(11, 17, 13));
  FillRect(memDC, &rc, bgBrush);
  DeleteObject(bgBrush);

  // 2. Titlebar background (#121c15)
  RECT tbRect = { 0, 0, w, TITLEBAR_HEIGHT };
  HBRUSH tbBrush = CreateSolidBrush(RGB(18, 28, 21));
  FillRect(memDC, &tbRect, tbBrush);
  DeleteObject(tbBrush);

  // 3. Outer armored amber border (#f59e0b) + bottom line of titlebar
  HPEN amberPen = CreatePen(PS_SOLID, 2, RGB(245, 158, 11));
  HGDIOBJ oldPen = SelectObject(memDC, amberPen);
  HGDIOBJ oldBr = SelectObject(memDC, GetStockObject(NULL_BRUSH));
  Rectangle(memDC, 1, 1, w - 1, h - 1);
  MoveToEx(memDC, 0, TITLEBAR_HEIGHT - 1, NULL);
  LineTo(memDC, w, TITLEBAR_HEIGHT - 1);

  // 4. Draw custom game icon in titlebar
  if (g_hIcon) {
    DrawIconEx(memDC, 10, 6, g_hIcon, 24, 24, 0, NULL, DI_NORMAL);
  }

  // 5. Titlebar text
  SetBkMode(memDC, TRANSPARENT);
  HFONT hFont = CreateFontW(
    15, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
    DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
    CLEARTYPE_QUALITY, FIXED_PITCH | FF_MODERN, L"Consolas"
  );
  HGDIOBJ oldFont = SelectObject(memDC, hFont);
  SetTextColor(memDC, RGB(251, 191, 36));
  RECT titleTextRc = { 42, 0, w - 140, TITLEBAR_HEIGHT };
  DrawTextW(
    memDC,
    L"☢ БУНКЕР «ЗАСЛОН-19»: ПЕПЕЛ УРАЛА // СИСТЕМА УПРАВЛЕНИЯ [ОС-КРЕМНИЙ]",
    -1,
    &titleTextRc,
    DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS
  );

  // 6. Custom Window Control Buttons: [ — ] Minimize, [ □ ] Maximize, [ ✕ ] Close
  const wchar_t* labels[3] = { L"—", L"□", L"✕" };
  for (int i = 1; i <= 3; i++) {
    RECT brc;
    GetTitlebarButtonRect(w, i, &brc);
    bool hovered = (g_hoverBtn == i);

    COLORREF fillCol = RGB(24, 36, 28);
    COLORREF borderCol = RGB(60, 82, 66);
    COLORREF txtCol = RGB(226, 232, 240);

    if (hovered) {
      if (i == 3) {
        fillCol = RGB(220, 38, 38);
        borderCol = RGB(248, 113, 113);
        txtCol = RGB(255, 255, 255);
      } else {
        fillCol = RGB(45, 66, 51);
        borderCol = RGB(245, 158, 11);
        txtCol = RGB(251, 191, 36);
      }
    }

    HBRUSH bBr = CreateSolidBrush(fillCol);
    FillRect(memDC, &brc, bBr);
    DeleteObject(bBr);

    HPEN bPen = CreatePen(PS_SOLID, 1, borderCol);
    SelectObject(memDC, bPen);
    Rectangle(memDC, brc.left, brc.top, brc.right, brc.bottom);
    DeleteObject(bPen);

    SetTextColor(memDC, txtCol);
    DrawTextW(memDC, labels[i - 1], -1, &brc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
  }

  // 7. Client Area status screen (shown during 0.2s WebView2 boot or fallback mode)
  if (!g_webviewReady) {
    RECT centerBox = { w / 2 - 310, h / 2 - 110, w / 2 + 310, h / 2 + 110 };
    HBRUSH cardBr = CreateSolidBrush(RGB(18, 27, 21));
    FillRect(memDC, &centerBox, cardBr);
    DeleteObject(cardBr);

    SelectObject(memDC, amberPen);
    Rectangle(memDC, centerBox.left, centerBox.top, centerBox.right, centerBox.bottom);

    SetTextColor(memDC, RGB(74, 222, 128));
    RECT l1 = { centerBox.left + 20, centerBox.top + 22, centerBox.right - 20, centerBox.top + 52 };
    DrawTextW(memDC, L"ТЕРМИНАЛ БУНКЕРА «ЗАСЛОН-19» АКТИВИРОВАН", -1, &l1, DT_CENTER | DT_SINGLELINE);

    SetTextColor(memDC, RGB(226, 232, 240));
    RECT l2 = { centerBox.left + 20, centerBox.top + 60, centerBox.right - 20, centerBox.top + 120 };
    DrawTextW(
      memDC,
      L"Инициализация 3D WebGL движка и систем жизнеобеспечения...\n"
      L"Локальный сервер запущен. Нажмите кнопку ниже, если окно браузера не открылось:",
      -1, &l2, DT_CENTER | DT_WORDBREAK
    );

    RECT launchBtn = { w / 2 - 180, centerBox.bottom - 62, w / 2 + 180, centerBox.bottom - 22 };
    HBRUSH lbBr = CreateSolidBrush(g_hoverBtn == 4 ? RGB(180, 83, 9) : RGB(120, 53, 15));
    FillRect(memDC, &launchBtn, lbBr);
    DeleteObject(lbBr);
    Rectangle(memDC, launchBtn.left, launchBtn.top, launchBtn.right, launchBtn.bottom);
    SetTextColor(memDC, RGB(254, 243, 199));
    DrawTextW(memDC, L"☢ РАЗВЕРНУТЬ ЭКРАН БУНКЕРА", -1, &launchBtn, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
  }

  BitBlt(hdc, 0, 0, w, h, memDC, 0, 0, SRCCOPY);

  SelectObject(memDC, oldFont);
  DeleteObject(hFont);
  SelectObject(memDC, oldPen);
  SelectObject(memDC, oldBr);
  DeleteObject(amberPen);
  SelectObject(memDC, oldBmp);
  DeleteObject(memBmp);
  DeleteDC(memDC);
}

// ============================================================================
// ОКОННАЯ ПРОЦЕДУРА КАСТОМНОГО БЕЗРАМОЧНОГО ОКНА (WS_POPUP)
// ============================================================================
static LRESULT CALLBACK BunkerWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_SIZE:
      ResizeWebViewBounds(hwnd);
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;

    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      PaintCustomBunkerWindow(hwnd, hdc);
      EndPaint(hwnd, &ps);
      return 0;
    }

    case WM_ERASEBKGND:
      return 1;

    case WM_NCHITTEST: {
      POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
      ScreenToClient(hwnd, &pt);
      RECT rc;
      GetClientRect(hwnd, &rc);
      int w = rc.right;
      int h = rc.bottom;

      // Check custom titlebar buttons first so they receive mouse clicks
      for (int i = 1; i <= 3; i++) {
        RECT brc;
        GetTitlebarButtonRect(w, i, &brc);
        if (PtInRect(&brc, pt)) return HTCLIENT;
      }

      // Resize borders (6px) when not maximized
      if (!IsZoomed(hwnd)) {
        const int grip = 6;
        bool left   = pt.x < grip;
        bool right  = pt.x >= w - grip;
        bool top    = pt.y < grip;
        bool bottom = pt.y >= h - grip;
        if (top && left)     return HTTOPLEFT;
        if (top && right)    return HTTOPRIGHT;
        if (bottom && left)  return HTBOTTOMLEFT;
        if (bottom && right) return HTBOTTOMRIGHT;
        if (left)            return HTLEFT;
        if (right)           return HTRIGHT;
        if (top)             return HTTOP;
        if (bottom)          return HTBOTTOM;
      }

      // Dragging the custom bunker titlebar moves the window natively!
      if (pt.y < TITLEBAR_HEIGHT) {
        return HTCAPTION;
      }
      return HTCLIENT;
    }

    case WM_MOUSEMOVE: {
      POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
      RECT rc;
      GetClientRect(hwnd, &rc);
      int w = rc.right;
      int h = rc.bottom;
      int newHover = 0;
      for (int i = 1; i <= 3; i++) {
        RECT brc;
        GetTitlebarButtonRect(w, i, &brc);
        if (PtInRect(&brc, pt)) {
          newHover = i;
          break;
        }
      }
      if (!g_webviewReady && newHover == 0) {
        RECT launchBtn = { w / 2 - 180, h / 2 + 110 - 62, w / 2 + 180, h / 2 + 110 - 22 };
        if (PtInRect(&launchBtn, pt)) newHover = 4;
      }
      if (newHover != g_hoverBtn) {
        g_hoverBtn = newHover;
        InvalidateRect(hwnd, NULL, FALSE);
      }
      return 0;
    }

    case WM_LBUTTONUP: {
      POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
      RECT rc;
      GetClientRect(hwnd, &rc);
      int w = rc.right;
      int h = rc.bottom;

      for (int i = 1; i <= 3; i++) {
        RECT brc;
        GetTitlebarButtonRect(w, i, &brc);
        if (PtInRect(&brc, pt)) {
          if (i == 1) ShowWindow(hwnd, SW_MINIMIZE);
          else if (i == 2) ShowWindow(hwnd, IsZoomed(hwnd) ? SW_RESTORE : SW_MAXIMIZE);
          else if (i == 3) PostMessageW(hwnd, WM_CLOSE, 0, 0);
          return 0;
        }
      }

      if (!g_webviewReady) {
        RECT launchBtn = { w / 2 - 180, h / 2 + 110 - 62, w / 2 + 180, h / 2 + 110 - 22 };
        if (PtInRect(&launchBtn, pt)) {
          LaunchFallbackAppWindow();
        }
      }
      return 0;
    }

    case WM_USER_WINCMD: {
      if (wParam == CMD_MINIMIZE) {
        ShowWindow(hwnd, SW_MINIMIZE);
      } else if (wParam == CMD_MAXIMIZE) {
        ShowWindow(hwnd, IsZoomed(hwnd) ? SW_RESTORE : SW_MAXIMIZE);
      } else if (wParam == CMD_CLOSE) {
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
      } else if (wParam == CMD_DRAG) {
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
      }
      return 0;
    }

    case WM_USER_WV2_FALLBK:
      LaunchFallbackAppWindow();
      return 0;

    case WM_DESTROY:
      if (g_wvController) {
        g_wvController->Close();
        g_wvController->Release();
        g_wvController = NULL;
      }
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wParam, lParam);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
  CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

  if (!StartLocalGameServer()) {
    MessageBoxW(NULL, L"Не удалось запустить локальный сервер бункера Заслон-19.", L"Ошибка", MB_ICONERROR);
    return 1;
  }

  g_hIcon = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_BUNKER_ICON));

  WNDCLASSEXW wc;
  memset(&wc, 0, sizeof(wc));
  wc.cbSize        = sizeof(WNDCLASSEXW);
  wc.style         = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
  wc.lpfnWndProc   = BunkerWndProc;
  wc.hInstance     = hInstance;
  wc.hCursor       = LoadCursor(NULL, IDC_ARROW);
  wc.hIcon         = g_hIcon;
  wc.hIconSm       = g_hIcon;
  wc.lpszClassName = L"Zaslon19BunkerFrameClass";
  RegisterClassExW(&wc);

  int scrW = GetSystemMetrics(SM_CXSCREEN);
  int scrH = GetSystemMetrics(SM_CYSCREEN);
  int winW = 1320;
  int winH = 820;
  if (winW > scrW - 40) winW = scrW - 40;
  if (winH > scrH - 40) winH = scrH - 40;

  // WS_POPUP полностью убирает стандартную белую рамку Windows!
  g_hwnd = CreateWindowExW(
    WS_EX_APPWINDOW,
    wc.lpszClassName,
    L"БУНКЕР «ЗАСЛОН-19»: ПЕПЕЛ УРАЛА",
    WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU | WS_CLIPCHILDREN | WS_VISIBLE,
    (scrW - winW) / 2,
    (scrH - winH) / 2,
    winW,
    winH,
    NULL,
    NULL,
    hInstance,
    NULL
  );

  ShowWindow(g_hwnd, SW_SHOW);
  UpdateWindow(g_hwnd);

  InitEmbeddedWebView2();

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }

  CoUninitialize();
  return 0;
}
