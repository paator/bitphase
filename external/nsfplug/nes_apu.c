//
// NES 2A03
//
#include <assert.h>
#include "nes_apu.h"

int32_t square_table[32];     // nonlinear mixer

static void sweep_sqr (nes_apu_t *s, int ch); // calculates target sweep frequency
static int32_t calc_sqr (nes_apu_t *s, int ch, uint32_t clocks);

void sweep_sqr (nes_apu_t *s, int i)
{
    int shifted = s->freq[i] >> s->sweep_amount[i];
    if (i == 0 && s->sweep_mode[i]) shifted += 1;
    s->sfreq[i] = s->freq[i] + (s->sweep_mode[i] ? -shifted : shifted);
    //DEBUG_OUT("shifted[%d] = %d (%d >> %d)\n",i,shifted,freq[i],sweep_amount[i]);
}

void nes_apu_FrameSequence(nes_apu_t *s, int seq)
{
  //DEBUG_OUT("FrameSequence(%d)\n",s);

  if (seq > 3) return; // no operation in step 4

  // 240hz clock
  for (int i=0; i < 2; ++i)
  {
      bool divider = false;
      if (s->envelope_write[i])
      {
          s->envelope_write[i] = false;
          s->envelope_counter[i] = 15;
          s->envelope_div[i] = 0;
      }
      else
      {
          ++s->envelope_div[i];
          if (s->envelope_div[i] > s->envelope_div_period[i])
          {
              divider = true;
              s->envelope_div[i] = 0;
          }
      }
      if (divider)
      {
          if (s->envelope_loop[i] && s->envelope_counter[i] == 0)
              s->envelope_counter[i] = 15;
          else if (s->envelope_counter[i] > 0)
              --s->envelope_counter[i];
      }
  }

  // 120hz clock
  if ((seq&1) == 0)
  for (int i=0; i < 2; ++i)
  {
      if (!s->envelope_loop[i] && (s->length_counter[i] > 0))
          --s->length_counter[i];

      if (s->sweep_enable[i])
      {
          //DEBUG_OUT("Clock sweep: %d\n", i);

          --s->sweep_div[i];
          if (s->sweep_div[i] <= 0)
          {
              sweep_sqr(s, i); // calculate new sweep target

              //DEBUG_OUT("sweep_div[%d] (0/%d)\n",i,sweep_div_period[i]);
              //DEBUG_OUT("freq[%d]=%d > sfreq[%d]=%d\n",i,freq[i],i,sfreq[i]);

              if (s->freq[i] >= 8 && s->sfreq[i] < 0x800 && s->sweep_amount[i] > 0) // update frequency if appropriate
              {
                  s->freq[i] = s->sfreq[i] < 0 ? 0 : s->sfreq[i];
              }
              s->sweep_div[i] = s->sweep_div_period[i] + 1;

              //DEBUG_OUT("freq[%d]=%d\n",i,freq[i]);
          }

          if (s->sweep_write[i])
          {
              s->sweep_div[i] = s->sweep_div_period[i] + 1;
              s->sweep_write[i] = false;
          }
      }
  }

}

int32_t calc_sqr (nes_apu_t *s, int i, uint32_t clocks)
{
  static const int16_t sqrtbl[4][16] = {
    {0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
    {0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
    {0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0},
    {1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}
  };

  s->scounter[i] -= clocks;
  while (s->scounter[i] < 0)
  {
      s->sphase[i] = (s->sphase[i] + 1) & 15;
      s->scounter[i] += s->freq[i] + 1;
  }

  int32_t ret = 0;
  if (s->length_counter[i] > 0 &&
      s->freq[i] >= 8 &&
      s->sfreq[i] < 0x800
      )
  {
      int v = s->envelope_disable[i] ? s->volume[i] : s->envelope_counter[i];
      ret = sqrtbl[s->duty[i]][s->sphase[i]] ? v : 0;
  }

  return ret;
}

bool nes_apu_Read (nes_apu_t *s, uint32_t adr, uint32_t* val)
{
  // if (0x4000 <= adr && adr < 0x4008)
  // {
  //   *val |= s->reg[adr&0x7];
  //   return true;
  // }
  // else if(adr==0x4015)
  if(adr==0x4015)
  {
    *val |= (s->length_counter[1]?2:0)|(s->length_counter[0]?1:0);
    return true;
  }
  else
    return false;
}

void nes_apu_Tick (nes_apu_t *s, uint32_t clocks)
{
  s->out[0] = calc_sqr(s, 0, clocks);
  s->out[1] = calc_sqr(s, 1, clocks);
}

// 生成される波形の振幅は0-8191
uint32_t nes_apu_Render (nes_apu_t *s, int32_t b[2])
{
  s->out[0] = (s->mask & 1) ? 0 : s->out[0];
  s->out[1] = (s->mask & 2) ? 0 : s->out[1];

  int32_t m[2];

  if(s->option[NES_APU_OPT_NONLINEAR_MIXER])
  {
      int32_t voltage = square_table[s->out[0] + s->out[1]];
      m[0] = s->out[0] << 6;
      m[1] = s->out[1] << 6;
      int32_t ref = m[0] + m[1];
      if (ref > 0)
      {
          m[0] = (m[0] * voltage) / ref;
          m[1] = (m[1] * voltage) / ref;
      }
      else
      {
          m[0] = voltage;
          m[1] = voltage;
      }
  }
  else
  {
      m[0] = (s->out[0] * s->square_linear) / 15;
      m[1] = (s->out[1] * s->square_linear) / 15;
  }

  b[0]  = m[0] * s->sm[0][0];
  b[0] += m[1] * s->sm[0][1];
  b[0] >>= 7;

  b[1]  = m[0] * s->sm[1][0];
  b[1] += m[1] * s->sm[1][1];
  b[1] >>= 7;

  return 2;
}

int32_t nes_apu_GetOut (nes_apu_t *s, int channel)
{
  if (channel < 0 || channel > 1)
    return 0;
  return s->out[channel];
}

void nes_apu_Init (nes_apu_t *s)
{
  s->option[NES_APU_OPT_UNMUTE_ON_RESET] = true;
  s->option[NES_APU_OPT_PHASE_REFRESH] = true;
  s->option[NES_APU_OPT_NONLINEAR_MIXER] = true;
  s->option[NES_APU_OPT_DUTY_SWAP] = false;
  s->option[NES_APU_OPT_NEGATE_SWEEP_INIT] = false;

  square_table[0] = 0;
  for(int i=1;i<32;i++)
      square_table[i]=(int32_t)((8192.0*95.88)/(8128.0/i+100));

  s->square_linear = square_table[15]; // match linear scale to one full volume square of nonlinear

  for(int c=0;c<2;++c)
      for(int t=0;t<2;++t)
          s->sm[c][t] = 128;
}

void nes_apu_Reset (nes_apu_t *s)
{
  int i;
  s->mask = 0;

  for (int i=0; i<2; ++i)
  {
      s->scounter[i] = 0;
      s->sphase[i] = 0;
      s->duty[i] = 0;
      s->volume[i] = 0;
      s->freq[i] = 0;
      s->sfreq[i] = 0;
      s->sweep_enable[i] = 0;
      s->sweep_mode[i] = 0;
      s->sweep_write[i] = 0;
      s->sweep_div_period[i] = 0;
      s->sweep_div[i] = 1;
      s->sweep_amount[i] = 0;
      s->envelope_disable[i] = 0;
      s->envelope_loop[i] = 0;
      s->envelope_write[i] = 0;
      s->envelope_div_period[i] = 0;
      s->envelope_div[0] = 0;
      s->envelope_counter[i] = 0;
      s->length_counter[i] = 0;
      s->enable[i] = 0;
  }

  for (i = 0x4000; i < 0x4008; i++)
    nes_apu_Write (s, i, 0);

  nes_apu_Write (s, 0x4015, 0);
  if (s->option[NES_APU_OPT_UNMUTE_ON_RESET])
    nes_apu_Write (s, 0x4015, 0x0f);
  if (s->option[NES_APU_OPT_NEGATE_SWEEP_INIT])
  {
    nes_apu_Write (s, 0x4001, 0x08);
    nes_apu_Write (s, 0x4005, 0x08);
  }

  for (i = 0; i < 2; i++)
    s->out[i] = 0;
}

void nes_apu_SetOption (nes_apu_t *s, int id, int val)
{
  if(id<NES_APU_OPT_END) s->option[id] = val;
}

void nes_apu_SetStereoMix(nes_apu_t *s, int trk, int32_t mixl, int32_t mixr)
{
    if (trk < 0) return;
    if (trk > 1) return;
    s->sm[0][trk] = mixl;
    s->sm[1][trk] = mixr;
}

bool nes_apu_Write (nes_apu_t *s, uint32_t adr, uint32_t val)
{
  int ch;

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

  if (0x4000 <= adr && adr < 0x4008)
  {
    //DEBUG_OUT("$%04X = %02X\n",adr,val);

    adr &= 0xf;
    ch = adr >> 2;
    switch (adr)
    {
    case 0x0:
    case 0x4:
      s->volume[ch] = val & 15;
      s->envelope_disable[ch] = (val >> 4) & 1;
      s->envelope_loop[ch] = (val >> 5) & 1;
      s->envelope_div_period[ch] = (val & 15);
      s->duty[ch] = (val >> 6) & 3;
      if (s->option[NES_APU_OPT_DUTY_SWAP])
      {
          if      (s->duty[ch] == 1) s->duty[ch] = 2;
          else if (s->duty[ch] == 2) s->duty[ch] = 1;
      }
      break;

    case 0x1:
    case 0x5:
      s->sweep_enable[ch] = (val >> 7) & 1;
      s->sweep_div_period[ch] = (((val >> 4) & 7));
      s->sweep_mode[ch] = (val >> 3) & 1;
      s->sweep_amount[ch] = val & 7;
      s->sweep_write[ch] = true;
      sweep_sqr(s, ch);
      break;

    case 0x2:
    case 0x6:
      s->freq[ch] = val | (s->freq[ch] & 0x700) ;
      sweep_sqr(s, ch);
      break;

    case 0x3:
    case 0x7:
      s->freq[ch] = (s->freq[ch] & 0xFF) | ((val & 0x7) << 8) ;
      if (s->option[NES_APU_OPT_PHASE_REFRESH])
        s->sphase[ch] = 0;
      s->envelope_write[ch] = true;
      if (s->enable[ch])
      {
        s->length_counter[ch] = length_table[(val >> 3) & 0x1f];
      }
      sweep_sqr(s, ch);
      break;

    default:
      return false;
    }
    // s->reg[adr] = val;
    return true;
  }
  else if (adr == 0x4015)
  {
    s->enable[0] = (val & 1) ? true : false;
    s->enable[1] = (val & 2) ? true : false;

    if (!s->enable[0])
        s->length_counter[0] = 0;
    if (!s->enable[1])
        s->length_counter[1] = 0;

    // s->reg[adr-0x4000] = val;
    return true;
  }

  // 4017 is handled in nes_dmc.cpp
  //else if (adr == 0x4017)
  //{
  //}

  return false;
}

void nes_apu_SetMask(nes_apu_t* s, int m)
{
  s->mask = m;
}
