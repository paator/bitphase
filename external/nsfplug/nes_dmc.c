#include "nes_dmc.h"
#include "nes_apu.h"
#include <assert.h>
#include <stdlib.h>

static const uint32_t wavlen_table[2][16] = {
{ // NTSC
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
},
{ // PAL
  4, 8, 14, 30, 60, 88, 118, 148, 188, 236, 354, 472, 708,  944, 1890, 3778
}};

static const uint32_t freq_table[2][16] = {
{ // NTSC
  428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
},
{ // PAL
  398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118,  98, 78, 66, 50
}};

static const uint32_t BITREVERSE[256] = {
  0x00, 0x80, 0x40, 0xC0, 0x20, 0xA0, 0x60, 0xE0, 0x10, 0x90, 0x50, 0xD0, 0x30, 0xB0, 0x70, 0xF0,
  0x08, 0x88, 0x48, 0xC8, 0x28, 0xA8, 0x68, 0xE8, 0x18, 0x98, 0x58, 0xD8, 0x38, 0xB8, 0x78, 0xF8,
  0x04, 0x84, 0x44, 0xC4, 0x24, 0xA4, 0x64, 0xE4, 0x14, 0x94, 0x54, 0xD4, 0x34, 0xB4, 0x74, 0xF4,
  0x0C, 0x8C, 0x4C, 0xCC, 0x2C, 0xAC, 0x6C, 0xEC, 0x1C, 0x9C, 0x5C, 0xDC, 0x3C, 0xBC, 0x7C, 0xFC,
  0x02, 0x82, 0x42, 0xC2, 0x22, 0xA2, 0x62, 0xE2, 0x12, 0x92, 0x52, 0xD2, 0x32, 0xB2, 0x72, 0xF2,
  0x0A, 0x8A, 0x4A, 0xCA, 0x2A, 0xAA, 0x6A, 0xEA, 0x1A, 0x9A, 0x5A, 0xDA, 0x3A, 0xBA, 0x7A, 0xFA,
  0x06, 0x86, 0x46, 0xC6, 0x26, 0xA6, 0x66, 0xE6, 0x16, 0x96, 0x56, 0xD6, 0x36, 0xB6, 0x76, 0xF6,
  0x0E, 0x8E, 0x4E, 0xCE, 0x2E, 0xAE, 0x6E, 0xEE, 0x1E, 0x9E, 0x5E, 0xDE, 0x3E, 0xBE, 0x7E, 0xFE,
  0x01, 0x81, 0x41, 0xC1, 0x21, 0xA1, 0x61, 0xE1, 0x11, 0x91, 0x51, 0xD1, 0x31, 0xB1, 0x71, 0xF1,
  0x09, 0x89, 0x49, 0xC9, 0x29, 0xA9, 0x69, 0xE9, 0x19, 0x99, 0x59, 0xD9, 0x39, 0xB9, 0x79, 0xF9,
  0x05, 0x85, 0x45, 0xC5, 0x25, 0xA5, 0x65, 0xE5, 0x15, 0x95, 0x55, 0xD5, 0x35, 0xB5, 0x75, 0xF5,
  0x0D, 0x8D, 0x4D, 0xCD, 0x2D, 0xAD, 0x6D, 0xED, 0x1D, 0x9D, 0x5D, 0xDD, 0x3D, 0xBD, 0x7D, 0xFD,
  0x03, 0x83, 0x43, 0xC3, 0x23, 0xA3, 0x63, 0xE3, 0x13, 0x93, 0x53, 0xD3, 0x33, 0xB3, 0x73, 0xF3,
  0x0B, 0x8B, 0x4B, 0xCB, 0x2B, 0xAB, 0x6B, 0xEB, 0x1B, 0x9B, 0x5B, 0xDB, 0x3B, 0xBB, 0x7B, 0xFB,
  0x07, 0x87, 0x47, 0xC7, 0x27, 0xA7, 0x67, 0xE7, 0x17, 0x97, 0x57, 0xD7, 0x37, 0xB7, 0x77, 0xF7,
  0x0F, 0x8F, 0x4F, 0xCF, 0x2F, 0xAF, 0x6F, 0xEF, 0x1F, 0x9F, 0x5F, 0xDF, 0x3F, 0xBF, 0x7F, 0xFF,
};

uint32_t tnd_table[2][16][16][128];

static uint32_t calc_tri (nes_dmc_t* s, uint32_t clocks);
static uint32_t calc_dmc (nes_dmc_t* s, uint32_t clocks);
static uint32_t calc_noise (nes_dmc_t* s, uint32_t clocks);

void nes_dmc_Init (nes_dmc_t* s)
{
  nes_dmc_SetPal (s, false);
  s->option[NES_DMC_OPT_ENABLE_4011] = 1;
  s->option[NES_DMC_OPT_ENABLE_PNOISE] = 1;
  s->option[NES_DMC_OPT_UNMUTE_ON_RESET] = 1;
  s->option[NES_DMC_OPT_DPCM_ANTI_CLICK] = 0;
  s->option[NES_DMC_OPT_NONLINEAR_MIXER] = 1;
  s->option[NES_DMC_OPT_RANDOMIZE_NOISE] = 1;
  s->option[NES_DMC_OPT_RANDOMIZE_TRI] = 1;
  s->option[NES_DMC_OPT_TRI_MUTE] = 1;
  s->option[NES_DMC_OPT_DPCM_REVERSE] = 0;
  tnd_table[0][0][0][0] = 0;
  tnd_table[1][0][0][0] = 0;

  s->apu = NULL;
  s->frame_sequence_count = 0;
  s->frame_sequence_length = 7458;
  s->frame_sequence_steps = 4;

  for(int c=0;c<2;++c)
      for(int t=0;t<3;++t)
          s->sm[c][t] = 128;
}

void nes_dmc_SetStereoMix(nes_dmc_t* s, int trk, int32_t mixl, int32_t mixr)
{
    if (trk < 0) return;
    if (trk > 2) return;
    s->sm[0][trk] = mixl;
    s->sm[1][trk] = mixr;
}

void nes_dmc_FrameSequence(nes_dmc_t* s, int seq)
{
  //DEBUG_OUT("FrameSequence: %d\n",s);

  if (seq > 3) return; // no operation in step 4

  if (s->apu)
  {
      nes_apu_FrameSequence(s->apu, seq);
  }

  if (seq == 0 && (s->frame_sequence_steps == 4))
  {
      if (s->frame_irq_enable) s->frame_irq = true;
      // s->cpu->UpdateIRQ(NES_CPU::IRQD_FRAME, s->frame_irq & s->frame_irq_enable);
  }

  // 240hz clock
  {
      // triangle linear counter
      if (s->linear_counter_halt)
      {
          s->linear_counter = s->linear_counter_reload;
      }
      else
      {
          if (s->linear_counter > 0) --s->linear_counter;
      }
      if (!s->linear_counter_control)
      {
          s->linear_counter_halt = false;
      }

      // noise envelope
      bool divider = false;
      if (s->envelope_write)
      {
          s->envelope_write = false;
          s->envelope_counter = 15;
          s->envelope_div = 0;
      }
      else
      {
          ++s->envelope_div;
          if (s->envelope_div > s->envelope_div_period)
          {
              divider = true;
              s->envelope_div = 0;
          }
      }
      if (divider)
      {
          if (s->envelope_loop && s->envelope_counter == 0)
              s->envelope_counter = 15;
          else if (s->envelope_counter > 0)
              --s->envelope_counter;
      }
  }

  // 120hz clock
  if ((seq&1) == 0)
  {
      // triangle length counter
      if (!s->linear_counter_control && (s->length_counter[0] > 0))
          --s->length_counter[0];

      // noise length counter
      if (!s->envelope_loop && (s->length_counter[1] > 0))
          --s->length_counter[1];
  }

}

// 三角波チャンネルの計算 戻り値は0-15
uint32_t calc_tri (nes_dmc_t* s, uint32_t clocks)
{
  static uint32_t tritbl[32] =
  {
    15,14,13,12,11,10, 9, 8,
    7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7,
    8, 9,10,11,12,13,14,15,
  };

  if (s->linear_counter > 0 && s->length_counter[0] > 0
      && (!s->option[NES_DMC_OPT_TRI_MUTE] || s->tri_freq > 0))
  {
    s->counter[0] -= clocks;
    while (s->counter[0] < 0)
    {
      s->tphase = (s->tphase + 1) & 31;
      s->counter[0] += (s->tri_freq + 1);
    }
  }

  uint32_t ret = tritbl[s->tphase];
  return ret;
}

// ノイズチャンネルの計算 戻り値は0-127
// 低サンプリングレートで合成するとエイリアスノイズが激しいので
// ノイズだけはこの関数内で高クロック合成し、簡易なサンプリングレート
// 変換を行っている。
uint32_t calc_noise(nes_dmc_t* s, uint32_t clocks)
{
  uint32_t env = s->envelope_disable ? s->noise_volume : s->envelope_counter;
  if (s->length_counter[1] < 1) env = 0;

  uint32_t last = (s->noise & 0x4000) ? 0 : env;
  if (clocks < 1) return last;

  // simple anti-aliasing (noise requires it, even when oversampling is off)
  uint32_t count = 0;
  uint32_t accum = s->counter[1] * last; // samples pending from previous calc
  uint32_t accum_clocks = s->counter[1];
  #ifdef _DEBUG
      int32_t start_clocks = counter[1];
  #endif
  if (s->counter[1] < 0) // only happens on startup when using the randomize noise option
  {
      accum = 0;
      accum_clocks = 0;
  }

  s->counter[1] -= clocks;
  assert (s->nfreq > 0); // prevent infinite loop
  while (s->counter[1] < 0)
  {
      // tick the noise generator
      uint32_t feedback = (s->noise&1) ^ ((s->noise&s->noise_tap)?1:0);
      s->noise = (s->noise>>1) | (feedback<<14);

      last = (s->noise & 0x4000) ? 0 : env;
      accum += (last * s->nfreq);
      s->counter[1] += s->nfreq;
      ++count;
      accum_clocks += s->nfreq;
  }

  if (count < 1) // no change over interval, don't anti-alias
  {
      return last;
  }

  accum -= (last * s->counter[1]); // remove these samples which belong in the next calc
  accum_clocks -= s->counter[1];
  #ifdef _DEBUG
      if (start_clocks >= 0) assert(accum_clocks == clocks); // these should be equal
  #endif

  uint32_t average = accum / accum_clocks;
  assert(average <= 15); // above this would indicate overflow
  return average;
}

// Tick the DMC for the number of clocks, and return output counter;
uint32_t calc_dmc (nes_dmc_t* s, uint32_t clocks)
{
  s->counter[2] -= clocks;
  assert (s->dfreq > 0); // prevent infinite loop
  while (s->counter[2] < 0)
  {
    s->counter[2] += s->dfreq;

    if ( s->data > 0x100 ) // data = 0x100 when shift register is empty
    {
      if (!s->empty)
      {
        if ((s->data & 1) && (s->damp < 63))
          s->damp++;
        else if (!(s->data & 1) && (0 < s->damp))
          s->damp--;
      }
      s->data >>=1;
    }

    if ( s->data <= 0x100 ) // shift register is empty
    {
      if (s->dlength > 0)
      {
        s->memory_Read (s->daddress, &s->data);
        // cpu->StealCycles(4); // DMC read takes 3 or 4 CPU cycles, usually 4
        // (checking for the 3-cycle case would require sub-instruction emulation)
        s->data &= 0xFF; // read 8 bits
        if (s->option[NES_DMC_OPT_DPCM_REVERSE]) s->data = BITREVERSE[s->data];
        s->data |= 0x10000; // use an extra bit to signal end of data
        s->empty = false;
        s->daddress = ((s->daddress+1)&0xFFFF)|0x8000 ;
        --s->dlength;
        if (s->dlength == 0)
        {
          if (s->mode & 1) // looped DPCM = auto-reload
          {
            s->daddress = ((s->adr_reg<<6)|0xC000);
            s->dlength = (s->len_reg<<4)+1;
          }
          else if (s->mode & 2) // IRQ and not looped
          {
            s->irq = true;
            // s->cpu->UpdateIRQ(NES_CPU::IRQD_DMC, true);
          }
        }
      }
      else
      {
        s->data = 0x10000; // DMC will do nothing
        s->empty = true;
      }
    }
  }

  return (s->damp<<1) + s->dac_lsb;
}

void nes_dmc_TickFrameSequence (nes_dmc_t* s, uint32_t clocks)
{
    s->frame_sequence_count += clocks;
    while (s->frame_sequence_count > s->frame_sequence_length)
    {
        nes_dmc_FrameSequence(s, s->frame_sequence_step);
        s->frame_sequence_count -= s->frame_sequence_length;
        ++s->frame_sequence_step;
        if(s->frame_sequence_step >= s->frame_sequence_steps)
            s->frame_sequence_step = 0;
    }
}

void nes_dmc_Tick (nes_dmc_t* s, uint32_t clocks)
{
  s->out[0] = calc_tri(s, clocks);
  s->out[1] = calc_noise(s, clocks);
  s->out[2] = calc_dmc(s, clocks);
}

uint32_t nes_dmc_Render (nes_dmc_t* s, int32_t b[2])
{
  s->out[0] = (s->mask & 1) ? 0 : s->out[0];
  s->out[1] = (s->mask & 2) ? 0 : s->out[1];
  s->out[2] = (s->mask & 4) ? 0 : s->out[2];

  int32_t m[3];
  m[0] = tnd_table[0][s->out[0]][0][0];
  m[1] = tnd_table[0][0][s->out[1]][0];
  m[2] = tnd_table[0][0][0][s->out[2]];

  if (s->option[NES_DMC_OPT_NONLINEAR_MIXER])
  {
      int32_t ref = m[0] + m[1] + m[2];
      int32_t voltage = tnd_table[1][s->out[0]][s->out[1]][s->out[2]];
      if (ref)
      {
          for (int i=0; i < 3; ++i)
              m[i] = (m[i] * voltage) / ref;
      }
      else
      {
          for (int i=0; i < 3; ++i)
              m[i] = voltage;
      }
  }

  // anti-click nullifies any 4011 write but preserves nonlinearity
  if (s->option[NES_DMC_OPT_DPCM_ANTI_CLICK])
  {
      if (s->dmc_pop) // $4011 will cause pop this frame
      {
          // adjust offset to counteract pop
          s->dmc_pop_offset += s->dmc_pop_follow - m[2];
          s->dmc_pop = false;

          // prevent overflow, keep headspace at edges
          const int32_t OFFSET_MAX = (1 << 30) - (4 << 16);
          if (s->dmc_pop_offset >  OFFSET_MAX) s->dmc_pop_offset =  OFFSET_MAX;
          if (s->dmc_pop_offset < -OFFSET_MAX) s->dmc_pop_offset = -OFFSET_MAX;
      }
      s->dmc_pop_follow = m[2]; // remember previous position

      m[2] += s->dmc_pop_offset; // apply offset

      // TODO implement this in a better way
      // roll off offset (not ideal, but prevents overflow)
      if (s->dmc_pop_offset > 0) --s->dmc_pop_offset;
      else if (s->dmc_pop_offset < 0) ++s->dmc_pop_offset;
  }

  b[0]  = m[0] * s->sm[0][0];
  b[0] += m[1] * s->sm[0][1];
  b[0] += m[2] * s->sm[0][2];
  b[0] >>= 7;

  b[1]  = m[0] * s->sm[1][0];
  b[1] += m[1] * s->sm[1][1];
  b[1] += m[2] * s->sm[1][2];
  b[1] >>= 7;

  return 2;
}

void nes_dmc_SetPal (nes_dmc_t* s, bool is_pal)
{
    s->pal = (is_pal ? 1 : 0);
    // set CPU cycles in frame_sequence
    s->frame_sequence_length = is_pal ? 8314 : 7458;
}

void nes_dmc_SetAPU (nes_dmc_t* s, nes_apu_t* apu_)
{
    s->apu = apu_;
}

// Initializing TRI, NOISE, DPCM mixing table
void nes_dmc_InitializeTNDTable(double wt, double wn, double wd) {

  // volume adjusted by 0.95 based on empirical measurements
  const double MASTER = 8192.0 * 0.95;
  // truthfully, the nonlinear curve does not appear to match well
  // with my tests. Do more testing of the APU/DMC DAC later.
  // this value keeps the triangle consistent with measured levels,
  // but not necessarily the rest of this APU channel,
  // because of the lack of a good DAC model, currently.

  { // Linear Mixer
    for(int t=0; t<16 ; t++) {
      for(int n=0; n<16; n++) {
        for(int d=0; d<128; d++) {
            tnd_table[0][t][n][d] = (uint32_t)(MASTER*(3.0*t+2.0*n+d)/208.0);
        }
      }
    }
  }
  { // Non-Linear Mixer
    tnd_table[1][0][0][0] = 0;
    for(int t=0; t<16 ; t++) {
      for(int n=0; n<16; n++) {
        for(int d=0; d<128; d++) {
          if(t!=0||n!=0||d!=0)
            tnd_table[1][t][n][d] = (uint32_t)((MASTER*159.79)/(100.0+1.0/((double)t/wt+(double)n/wn+(double)d/wd)));
        }
      }
    }
  }

}

void nes_dmc_Reset (nes_dmc_t* s)
{
  int i;
  s->mask = 0;

  nes_dmc_InitializeTNDTable(8227,12241,22638);

  s->counter[0] = 0;
  s->counter[1] = 0;
  s->counter[2] = 0;
  s->tphase = 0;
  s->nfreq = wavlen_table[0][0];
  s->dfreq = freq_table[0][0];
  s->tri_freq = 0;
  s->linear_counter = 0;
  s->linear_counter_reload = 0;
  s->linear_counter_halt = 0;
  s->linear_counter_control = 0;
  s->noise_volume = 0;
  s->noise = 0;
  s->noise_tap = 0;
  s->envelope_loop = 0;
  s->envelope_disable = 0;
  s->envelope_write = 0;
  s->envelope_div_period = 0;
  s->envelope_div = 0;
  s->envelope_counter = 0;
  s->enable[0] = 0;
  s->enable[1] = 0;
  s->length_counter[0] = 0;
  s->length_counter[1] = 0;
  s->frame_irq = false;
  s->frame_irq_enable = false;
  s->frame_sequence_count = 0;
  s->frame_sequence_steps = 4;
  s->frame_sequence_step = 0;
  // s->cpu->UpdateIRQ(NES_CPU::IRQD_FRAME, false);

  for (i = 0; i < 0x0F; i++)
    nes_dmc_Write (s, 0x4008 + i, 0);
  nes_dmc_Write (s, 0x4017, 0x40);

  s->irq = false;
  nes_dmc_Write (s, 0x4015, 0x00);
  if (s->option[NES_DMC_OPT_UNMUTE_ON_RESET])
    nes_dmc_Write (s, 0x4015, 0x0f);
  // s->cpu->UpdateIRQ(NES_CPU::IRQD_DMC, false);

  s->out[0] = s->out[1] = s->out[2] = 0;
  s->damp = 0;
  s->dmc_pop = false;
  s->dmc_pop_offset = 0;
  s->dmc_pop_follow = 0;
  s->dac_lsb = 0;
  s->data = 0x100;
  s->empty = true;
  s->adr_reg = 0;
  s->dlength = 0;
  s->len_reg = 0;
  s->daddress = 0;
  s->noise = 1;
  s->noise_tap = (1<<1);

  // if (s->option[NES_DMC_OPT_RANDOMIZE_NOISE])
  // {
  //     s->noise |= rand();
  //     s->counter[1] = -(rand() & 511);
  // }
  // if (s->option[NES_DMC_OPT_RANDOMIZE_TRI])
  // {
  //     s->tphase = rand() & 31;
  //     s->counter[0] = -(rand() & 2047);
  // }
}

void nes_dmc_SetMemory_Read (nes_dmc_t* s, read_func * r)
{
  s->memory_Read = r;
}

void nes_dmc_SetOption (nes_dmc_t* s, int id, int val)
{
  if(id<NES_DMC_OPT_END)
  {
    s->option[id] = val;
    if(id==NES_DMC_OPT_NONLINEAR_MIXER)
      nes_dmc_InitializeTNDTable(8227,12241,22638);
  }
}

bool nes_dmc_Write (nes_dmc_t* s, uint32_t adr, uint32_t val)
{
  static const uint8_t length_table[32] = {
      0x0A, 0xFE,
      0x14, 0x02,
      0x28, 0x04,
      0x50, 0x06,
      0xA0, 0x08,
      0x3C, 0x0A,
      0x0E, 0x0C,
      0x1A, 0x0E,
      0x0C, 0x10,
      0x18, 0x12,
      0x30, 0x14,
      0x60, 0x16,
      0xC0, 0x18,
      0x48, 0x1A,
      0x10, 0x1C,
      0x20, 0x1E
  };

  if (adr == 0x4015)
  {
    s->enable[0] = (val & 4) ? true : false;
    s->enable[1] = (val & 8) ? true : false;

    if (!s->enable[0])
    {
        s->length_counter[0] = 0;
    }
    if (!s->enable[1])
    {
        s->length_counter[1] = 0;
    }

    if ((val & 16) && s->dlength == 0)
    {
      s->daddress = (0xC000 | (s->adr_reg << 6));
      s->dlength = (s->len_reg << 4) + 1;
    }
    else if (!(val & 16))
    {
      s->dlength = 0;
    }

    s->irq = false;
    // s->cpu->UpdateIRQ(NES_CPU::IRQD_DMC, false);

    s->reg[adr-0x4008] = val;
    return true;
  }

  if (adr == 0x4017)
  {
    //DEBUG_OUT("4017 = %02X\n", val);
    s->frame_irq_enable = ((val & 0x40) != 0x40);
    if (s->frame_irq_enable) s->frame_irq = false;
    // s->cpu->UpdateIRQ(NES_CPU::IRQD_FRAME, false);

    s->frame_sequence_count = 0;
    if (val & 0x80)
    {
      s->frame_sequence_steps = 5;
      s->frame_sequence_step = 0;
      nes_dmc_FrameSequence(s, s->frame_sequence_step);
      ++s->frame_sequence_step;
    }
    else
    {
      s->frame_sequence_steps = 4;
      s->frame_sequence_step = 1;
    }
  }

  if (adr<0x4008||0x4013<adr)
    return false;

  s->reg[adr-0x4008] = val&0xff;

  //DEBUG_OUT("$%04X %02X\n", adr, val);

  switch (adr)
  {

  // tri

  case 0x4008:
    s->linear_counter_control = (val >> 7) & 1;
    s->linear_counter_reload = val & 0x7F;
    break;

  case 0x4009:
    break;

  case 0x400a:
    s->tri_freq = val | (s->tri_freq & 0x700) ;
    break;

  case 0x400b:
    s->tri_freq = (s->tri_freq & 0xff) | ((val & 0x7) << 8) ;
    s->linear_counter_halt = true;
    if (s->enable[0])
    {
      s->length_counter[0] = length_table[(val >> 3) & 0x1f];
    }
    break;

  // noise

  case 0x400c:
    s->noise_volume = val & 15;
    s->envelope_div_period = val & 15;
    s->envelope_disable = (val >> 4) & 1;
    s->envelope_loop = (val >> 5) & 1;
    break;

  case 0x400d:
    break;

  case 0x400e:
    if (s->option[NES_DMC_OPT_ENABLE_PNOISE])
      s->noise_tap = (val & 0x80) ? (1<<6) : (1<<1);
    else
      s->noise_tap = (1<<1);
    s->nfreq = wavlen_table[s->pal][val&15];
    break;

  case 0x400f:
    if (s->enable[1])
    {
      s->length_counter[1] = length_table[(val >> 3) & 0x1f];
    }
    s->envelope_write = true;
    break;

  // dmc

  case 0x4010:
    s->mode = (val >> 6) & 3;
    if (!(s->mode & 2))
    {
      s->irq = false;
      // s->cpu->UpdateIRQ(NES_CPU::IRQD_DMC, false);
    }
    s->dfreq = freq_table[s->pal][val&15];
    break;

  case 0x4011:
    if (s->option[NES_DMC_OPT_ENABLE_4011])
    {
      s->damp = (val >> 1) & 0x3f;
      s->dac_lsb = val & 1;
      s->dmc_pop = true;
    }
    break;

  case 0x4012:
    s->adr_reg = val&0xff;
    // ここでdaddressは更新されない
    break;

  case 0x4013:
    s->len_reg = val&0xff;
    // ここでlengthは更新されない
    break;

  default:
    return false;
  }

  return true;
}

bool nes_dmc_Read (nes_dmc_t* s, uint32_t adr, uint32_t* val)
{
  if (adr == 0x4015)
  {
    *val |=(s->irq               ? 0x80 : 0)
         | (s->frame_irq         ? 0x40 : 0)
         | ((s->dlength>0)       ? 0x10 : 0)
         | (s->length_counter[1] ? 0x08 : 0)
         | (s->length_counter[0] ? 0x04 : 0)
         ;

    s->frame_irq = false;
    // s->cpu->UpdateIRQ(NES_CPU::IRQD_FRAME, false);
    return true;
  }
  else if (0x4008<=adr&&adr<=0x4014)
  {
    *val |= s->reg[adr-0x4008];
    return true;
  }
  else
    return false;
}

// // IRQ support requires CPU read access
// void nes_dmc_SetCPU(nes_dmc_t* s, NES_CPU* cpu_)
// {
//     s->cpu = cpu_;
// }

int nes_dmc_GetDamp(nes_dmc_t* s)
{
  return (s->damp<<1)|s->dac_lsb;
}

void nes_dmc_SetMask(nes_dmc_t* s, int m)
{
  s->mask = m;
}
