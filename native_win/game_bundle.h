#pragma once
extern "C" const unsigned char GAME_HTML_BUNDLE[];
static const unsigned int GAME_HTML_BUNDLE_len = 933023;
__asm__(
  ".section .rdata,\"dr\"\n"
  ".globl GAME_HTML_BUNDLE\n"
  "GAME_HTML_BUNDLE:\n"
  ".incbin \"dist/Zaslon19_Standalone.html\"\n"
  ".byte 0\n"
);
