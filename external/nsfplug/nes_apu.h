#ifndef _NES_APU_H_
#define _NES_APU_H_
#include "nes_dmc.h"

/** Upper half of APU **/
typedef struct nes_apu
{
  enum
  {
      NES_APU_OPT_UNMUTE_ON_RESET=0,
      NES_APU_OPT_PHASE_REFRESH,
      NES_APU_OPT_NONLINEAR_MIXER,
      NES_APU_OPT_DUTY_SWAP,
      NES_APU_OPT_NEGATE_SWEEP_INIT,
      NES_APU_OPT_END };

  enum
  { SQR0_MASK = 1, SQR1_MASK = 2, };

  int option[NES_APU_OPT_END];        // 各種オプション
  int mask;
  int32_t sm[2][2];

  uint32_t gclock;
  // uint8_t reg[0x20];
  int32_t out[2];
  double rate, clock;

  int32_t square_linear;        // linear mix approximation

  int scounter[2];            // frequency divider
  int sphase[2];              // phase counter

  int duty[2];
  int volume[2];
  int freq[2];
  int sfreq[2];

  bool sweep_enable[2];
  bool sweep_mode[2];
  bool sweep_write[2];
  int sweep_div_period[2];
  int sweep_div[2];
  int sweep_amount[2];

  bool envelope_disable[2];
  bool envelope_loop[2];
  bool envelope_write[2];
  int envelope_div_period[2];
  int envelope_div[2];
  int envelope_counter[2];

  int length_counter[2];

  bool enable[2];
} nes_apu_t;

void nes_apu_FrameSequence(nes_apu_t *s, int seq);

void nes_apu_Init (nes_apu_t *s);
void nes_apu_Reset (nes_apu_t *s);
void nes_apu_Tick (nes_apu_t *s, uint32_t clocks);
uint32_t nes_apu_Render (nes_apu_t *s, int32_t b[2]);
bool nes_apu_Read (nes_apu_t *s, uint32_t adr, uint32_t* val);
bool nes_apu_Write (nes_apu_t *s, uint32_t adr, uint32_t val);
void nes_apu_SetOption (nes_apu_t *s, int id, int b);
void nes_apu_SetMask(nes_apu_t *s, int m);
void nes_apu_SetStereoMix (nes_apu_t *s, int trk, int32_t mixl, int32_t mixr);

int32_t nes_apu_GetOut (nes_apu_t *s, int channel);

#endif
