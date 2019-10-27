#include <napi.h>
namespace functions {
  int mapRange(int num, int inMin, int inMax, int outMin, int outMax);
  Napi::Number MapRangeWrapped(const Napi::CallbackInfo& info);
  int reverseNumber(int num, int inMin, int inMax);
  Napi::Number ReverseNumberWrapped(const Napi::CallbackInfo& info);
  int getAFromRGB(int ri, int gi, int bi);
  Napi::Number getAFromRGBWrapped(const Napi::CallbackInfo& info);
  Napi::Object Init(Napi::Env env, Napi::Object exports);
}