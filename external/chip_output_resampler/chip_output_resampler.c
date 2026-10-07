#include "chip_output_resampler.h"

#include <stdlib.h>
#include <string.h>

#define FIR_STRIDE (CHIP_RESAMPLER_FIR_SIZE * 2)
#define FIR_INDEX_PERIOD (CHIP_RESAMPLER_FIR_SIZE / CHIP_RESAMPLER_DECIMATE_FACTOR - 1)

static int fir_base(const struct chip_output_resampler* r) {
  return CHIP_RESAMPLER_FIR_SIZE - r->fir_index * CHIP_RESAMPLER_DECIMATE_FACTOR;
}

static double* fir_channel(struct chip_output_resampler* r, int channel) {
  return r->fir + channel * FIR_STRIDE;
}

static double decimate(double* x) {
  double y = -0.0000046183113992051936 * (x[1] + x[191]) +
      -0.00001117761640887225 * (x[2] + x[190]) +
      -0.000018610264502005432 * (x[3] + x[189]) +
      -0.000025134586135631012 * (x[4] + x[188]) +
      -0.000028494281690666197 * (x[5] + x[187]) +
      -0.000026396828793275159 * (x[6] + x[186]) +
      -0.000017094212558802156 * (x[7] + x[185]) +
      0.000023798193576966866 * (x[9] + x[183]) +
      0.000051281160242202183 * (x[10] + x[182]) +
      0.00007762197826243427 * (x[11] + x[181]) +
      0.000096759426664120416 * (x[12] + x[180]) +
      0.00010240229300393402 * (x[13] + x[179]) +
      0.000089344614218077106 * (x[14] + x[178]) +
      0.000054875700118949183 * (x[15] + x[177]) +
      -0.000069839082210680165 * (x[17] + x[175]) +
      -0.0001447966132360757 * (x[18] + x[174]) +
      -0.00021158452917708308 * (x[19] + x[173]) +
      -0.00025535069106550544 * (x[20] + x[172]) +
      -0.00026228714374322104 * (x[21] + x[171]) +
      -0.00022258805927027799 * (x[22] + x[170]) +
      -0.00013323230495695704 * (x[23] + x[169]) +
      0.00016182578767055206 * (x[25] + x[167]) +
      0.00032846175385096581 * (x[26] + x[166]) +
      0.00047045611576184863 * (x[27] + x[165]) +
      0.00055713851457530944 * (x[28] + x[164]) +
      0.00056212565121518726 * (x[29] + x[163]) +
      0.00046901918553962478 * (x[30] + x[162]) +
      0.00027624866838952986 * (x[31] + x[161]) +
      -0.00032564179486838622 * (x[33] + x[159]) +
      -0.00065182310286710388 * (x[34] + x[158]) +
      -0.00092127787309319298 * (x[35] + x[157]) +
      -0.0010772534348943575 * (x[36] + x[156]) +
      -0.0010737727700273478 * (x[37] + x[155]) +
      -0.00088556645390392634 * (x[38] + x[154]) +
      -0.00051581896090765534 * (x[39] + x[153]) +
      0.00059548767193795277 * (x[41] + x[151]) +
      0.0011803558710661009 * (x[42] + x[150]) +
      0.0016527320270369871 * (x[43] + x[149]) +
      0.0019152679330965555 * (x[44] + x[148]) +
      0.0018927324805381538 * (x[45] + x[147]) +
      0.0015481870327877937 * (x[46] + x[146]) +
      0.00089470695834941306 * (x[47] + x[145]) +
      -0.0010178225878206125 * (x[49] + x[143]) +
      -0.0020037400552054292 * (x[50] + x[142]) +
      -0.0027874356824117317 * (x[51] + x[141]) +
      -0.003210329988021943 * (x[52] + x[140]) +
      -0.0031540624117984395 * (x[53] + x[139]) +
      -0.0025657163651900345 * (x[54] + x[138]) +
      -0.0014750752642111449 * (x[55] + x[137]) +
      0.0016624165446378462 * (x[57] + x[135]) +
      0.0032591192839069179 * (x[58] + x[134]) +
      0.0045165685815867747 * (x[59] + x[133]) +
      0.0051838984346123896 * (x[60] + x[132]) +
      0.0050774264697459933 * (x[61] + x[131]) +
      0.0041192521414141585 * (x[62] + x[130]) +
      0.0023628575417966491 * (x[63] + x[129]) +
      -0.0026543507866759182 * (x[65] + x[127]) +
      -0.0051990251084333425 * (x[66] + x[126]) +
      -0.0072020238234656924 * (x[67] + x[125]) +
      -0.0082672928192007358 * (x[68] + x[124]) +
      -0.0081033739572956287 * (x[69] + x[123]) +
      -0.006583111539570221 * (x[70] + x[122]) +
      -0.0037839040415292386 * (x[71] + x[121]) +
      0.0042781252851152507 * (x[73] + x[119]) +
      0.0084176358598320178 * (x[74] + x[118]) +
      0.01172566057463055 * (x[75] + x[117]) +
      0.013550476647788672 * (x[76] + x[116]) +
      0.013388189369997496 * (x[77] + x[115]) +
      0.010979501242341259 * (x[78] + x[114]) +
      0.006381274941685413 * (x[79] + x[113]) +
      -0.007421229604153888 * (x[81] + x[111]) +
      -0.01486456304340213 * (x[82] + x[110]) +
      -0.021143584622178104 * (x[83] + x[109]) +
      -0.02504275058758609 * (x[84] + x[108]) +
      -0.025473530942547201 * (x[85] + x[107]) +
      -0.021627310017882196 * (x[86] + x[106]) +
      -0.013104323383225543 * (x[87] + x[105]) +
      0.017065133989980476 * (x[89] + x[103]) +
      0.036978919264451952 * (x[90] + x[102]) +
      0.05823318062093958 * (x[91] + x[101]) +
      0.079072012081405949 * (x[92] + x[100]) +
      0.097675998716952317 * (x[93] + x[99]) +
      0.11236045936950932 * (x[94] + x[98]) +
      0.12176343577287731 * (x[95] + x[97]) +
      0.125 * x[96];
  memcpy(
      &x[CHIP_RESAMPLER_FIR_SIZE - CHIP_RESAMPLER_DECIMATE_FACTOR],
      x,
      CHIP_RESAMPLER_DECIMATE_FACTOR * sizeof(double));
  return y;
}

static int pulls_for_step(double* x, double step) {
  int pulls = 0;
  *x += step;
  while (*x >= 1.0) {
    *x -= 1.0;
    pulls += 1;
  }
  return pulls;
}

void chip_output_resampler_bind(
    struct chip_output_resampler* r,
    int channel_count,
    double* y,
    double* c,
    double* fir,
    double* output) {
  memset(r, 0, sizeof(*r));
  r->channel_count = channel_count;
  r->y = y;
  r->c = c;
  r->fir = fir;
  r->output = output;
}

struct chip_output_resampler* chip_output_resampler_create(int channel_count) {
  struct chip_output_resampler* r;
  double* y;
  double* c;
  double* fir;
  double* output;
  double* source;
  if (channel_count < 1) return NULL;
  r = (struct chip_output_resampler*)malloc(sizeof(*r));
  y = (double*)calloc((size_t)channel_count * 4, sizeof(double));
  c = (double*)calloc((size_t)channel_count * 3, sizeof(double));
  fir = (double*)calloc((size_t)channel_count * FIR_STRIDE, sizeof(double));
  output = (double*)calloc((size_t)channel_count, sizeof(double));
  source = (double*)calloc(
      (size_t)channel_count * CHIP_RESAMPLER_MAX_SOURCE, sizeof(double));
  if (!r || !y || !c || !fir || !output || !source) {
    free(r);
    free(y);
    free(c);
    free(fir);
    free(output);
    free(source);
    return NULL;
  }
  chip_output_resampler_bind(r, channel_count, y, c, fir, output);
  r->source = source;
  r->owns_memory = 1;
  return r;
}

void chip_output_resampler_destroy(struct chip_output_resampler* r) {
  if (!r) return;
  if (r->owns_memory) {
    free(r->y);
    free(r->c);
    free(r->fir);
    free(r->output);
    free(r->source);
    free(r);
  }
}

void chip_output_resampler_reset(struct chip_output_resampler* r) {
  r->x = 0.0;
  r->fir_index = 0;
  if (r->y) memset(r->y, 0, (size_t)r->channel_count * 4 * sizeof(double));
  if (r->c) memset(r->c, 0, (size_t)r->channel_count * 3 * sizeof(double));
  if (r->fir) memset(r->fir, 0, (size_t)r->channel_count * FIR_STRIDE * sizeof(double));
  if (r->output) memset(r->output, 0, (size_t)r->channel_count * sizeof(double));
}

void chip_output_resampler_configure(
    struct chip_output_resampler* r,
    double render_rate,
    double sample_rate) {
  if (!(render_rate > 0.0) || !(sample_rate > 0.0)) {
    r->step = 0.0;
    r->render_rate = 0.0;
    r->sample_rate = 0.0;
    return;
  }
  if (r->render_rate == render_rate && r->sample_rate == sample_rate) return;
  r->render_rate = render_rate;
  r->sample_rate = sample_rate;
  r->step = render_rate / (sample_rate * (double)CHIP_RESAMPLER_DECIMATE_FACTOR);
  chip_output_resampler_reset(r);
}

void chip_output_resampler_begin_frame(struct chip_output_resampler* r) {
  r->fir_index = (r->fir_index + 1) % FIR_INDEX_PERIOD;
}

int chip_output_resampler_prepare_slot(struct chip_output_resampler* r) {
  return pulls_for_step(&r->x, r->step);
}

void chip_output_resampler_push(struct chip_output_resampler* r, const double* sample) {
  int ch;
  for (ch = 0; ch < r->channel_count; ch += 1) {
    double* y = r->y + ch * 4;
    double* c = r->c + ch * 3;
    double slope;
    y[0] = y[1];
    y[1] = y[2];
    y[2] = y[3];
    y[3] = sample[ch];
    slope = y[2] - y[0];
    c[0] = 0.5 * y[1] + 0.25 * (y[0] + y[2]);
    c[1] = 0.5 * slope;
    c[2] = 0.25 * (y[3] - y[1] - slope);
  }
}

void chip_output_resampler_write_slot(struct chip_output_resampler* r, int slot) {
  int base = fir_base(r);
  int ch;
  for (ch = 0; ch < r->channel_count; ch += 1) {
    double* c = r->c + ch * 3;
    fir_channel(r, ch)[base + slot] = (c[2] * r->x + c[1]) * r->x + c[0];
  }
}

void chip_output_resampler_finish_frame(struct chip_output_resampler* r) {
  int base = fir_base(r);
  int ch;
  for (ch = 0; ch < r->channel_count; ch += 1) {
    r->output[ch] = decimate(fir_channel(r, ch) + base);
  }
}

int chip_output_resampler_samples_for_frame(const struct chip_output_resampler* r) {
  double x = r->x;
  int needed = 0;
  int i;
  for (i = 0; i < CHIP_RESAMPLER_DECIMATE_FACTOR; i += 1) {
    needed += pulls_for_step(&x, r->step);
  }
  return needed;
}

void chip_output_resampler_process_frame(struct chip_output_resampler* r) {
  int pos = 0;
  int i;
  chip_output_resampler_begin_frame(r);
  for (i = CHIP_RESAMPLER_DECIMATE_FACTOR - 1; i >= 0; i -= 1) {
    int pulls = chip_output_resampler_prepare_slot(r);
    int p;
    for (p = 0; p < pulls; p += 1) {
      const double* sample = r->source + pos * r->channel_count;
      if (pos < CHIP_RESAMPLER_MAX_SOURCE) {
        chip_output_resampler_push(r, sample);
      }
      pos += 1;
    }
    chip_output_resampler_write_slot(r, i);
  }
  chip_output_resampler_finish_frame(r);
}

double* chip_output_resampler_source(struct chip_output_resampler* r) {
  return r->source;
}

double* chip_output_resampler_output(struct chip_output_resampler* r) {
  return r->output;
}

int chip_output_resampler_max_source(void) {
  return CHIP_RESAMPLER_MAX_SOURCE;
}
