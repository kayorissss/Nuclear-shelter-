#pragma once
extern "C" const unsigned char WEBVIEW2_LOADER_DLL[];
static const unsigned int WEBVIEW2_LOADER_DLL_len = 161864;
__asm__(
  ".section .rdata,\"dr\"\n"
  ".globl WEBVIEW2_LOADER_DLL\n"
  "WEBVIEW2_LOADER_DLL:\n"
  ".incbin \"native_win/WebView2Loader.dll\"\n"
);
