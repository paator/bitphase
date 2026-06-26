#ifndef _NES_DMC_H_
#define _NES_DMC_H_

#include <stdint.h>
#include <stdbool.h>

typedef struct nes_apu nes_apu_t; // forward declaration
typedef bool(read_func)(uint32_t,uint32_t*);

/** Bottom Half of APU **/
typedef struct nes_dmc
{
  enum
  {
    NES_DMC_OPT_ENABLE_4011=0,
    NES_DMC_OPT_ENABLE_PNOISE,
    NES_DMC_OPT_UNMUTE_ON_RESET,
    NES_DMC_OPT_DPCM_ANTI_CLICK,
    NES_DMC_OPT_NONLINEAR_MIXER,
    NES_DMC_OPT_RANDOMIZE_NOISE,
    NES_DMC_OPT_TRI_MUTE,
    NES_DMC_OPT_RANDOMIZE_TRI,
    NES_DMC_OPT_DPCM_REVERSE,
    NES_DMC_OPT_END
  };

  int option[NES_DMC_OPT_END];
  int mask;
  int32_t sm[2][3];
  uint8_t reg[0x10];
  uint32_t len_reg;
  uint32_t adr_reg;
  read_func* memory_Read;
  uint32_t out[3];
  uint32_t daddress;
  uint32_t dlength;
  uint32_t data;
  bool empty;
  uint16_t damp;
  int dac_lsb;
  bool dmc_pop;
  int32_t dmc_pop_offset;
  int32_t dmc_pop_follow;
  double clock;
  uint32_t rate;
  int pal;
  int mode;
  bool irq;

  int32_t counter[3];  // frequency dividers
  int tphase;        // triangle phase
  uint32_t nfreq;      // noise frequency
  uint32_t dfreq;      // DPCM frequency

  uint32_t tri_freq;
  int linear_counter;
  int linear_counter_reload;
  bool linear_counter_halt;
  bool linear_counter_control;

  int noise_volume;
  uint32_t noise, noise_tap;

  // noise envelope
  bool envelope_loop;
  bool envelope_disable;
  bool envelope_write;
  int envelope_div_period;
  int envelope_div;
  int envelope_counter;

  bool enable[2]; // tri/noise enable
  int length_counter[2]; // 0=tri, 1=noise

  // frame sequencer
  nes_apu_t* apu; // apu is clocked by DMC's frame sequencer
  int frame_sequence_count;  // current cycle count
  int frame_sequence_length; // CPU cycles per FrameSequence
  int frame_sequence_step;   // current step of frame sequence
  int frame_sequence_steps;  // 4/5 steps per frame
  bool frame_irq;
  bool frame_irq_enable;

  // NES_CPU* cpu; // IRQ needs CPU access
} nes_dmc_t;

void nes_dmc_InitializeTNDTable(double wt, double wn, double wd);
void nes_dmc_SetPal (nes_dmc_t* s, bool is_pal);
void nes_dmc_SetAPU (nes_dmc_t* s, nes_apu_t* apu_);
void nes_dmc_SetMemory_Read (nes_dmc_t* s, read_func* r);
void nes_dmc_FrameSequence(nes_dmc_t* s, int seq);
int nes_dmc_GetDamp(nes_dmc_t* s);
void nes_dmc_TickFrameSequence (nes_dmc_t* s, uint32_t clocks);

void nes_dmc_Init (nes_dmc_t* s);
void nes_dmc_Reset (nes_dmc_t* s);
void nes_dmc_Tick (nes_dmc_t* s, uint32_t clocks);
uint32_t nes_dmc_Render (nes_dmc_t* s, int32_t b[2]);
bool nes_dmc_Write (nes_dmc_t* s, uint32_t adr, uint32_t val);
bool nes_dmc_Read (nes_dmc_t* s, uint32_t adr, uint32_t* val);
void nes_dmc_SetOption (nes_dmc_t* s, int id, int b);
void nes_dmc_SetStereoMix (nes_dmc_t* s, int trk, int32_t mixl, int32_t mixr);

int32_t nes_dmc_GetOut (nes_dmc_t* s, int channel);

// void nes_dmc_SetCPU(nes_dmc_t* s, NES_CPU* cpu_);

#endif
