#ifndef CHIP_OUTPUT_RESAMPLER_H
#define CHIP_OUTPUT_RESAMPLER_H

#define CHIP_RESAMPLER_DECIMATE_FACTOR 8
#define CHIP_RESAMPLER_FIR_SIZE 192
#define CHIP_RESAMPLER_MAX_SOURCE 128

struct chip_output_resampler {
  int channel_count;
  double render_rate;
  double sample_rate;
  double step;
  double x;
  int fir_index;
  double* y;
  double* c;
  double* fir;
  double* output;
  double* source;
  int owns_memory;
};

void chip_output_resampler_bind(
    struct chip_output_resampler* r,
    int channel_count,
    double* y,
    double* c,
    double* fir,
    double* output);
struct chip_output_resampler* chip_output_resampler_create(int channel_count);
void chip_output_resampler_destroy(struct chip_output_resampler* r);
void chip_output_resampler_configure(
    struct chip_output_resampler* r,
    double render_rate,
    double sample_rate);
void chip_output_resampler_reset(struct chip_output_resampler* r);
void chip_output_resampler_begin_frame(struct chip_output_resampler* r);
int chip_output_resampler_prepare_slot(struct chip_output_resampler* r);
void chip_output_resampler_push(struct chip_output_resampler* r, const double* sample);
void chip_output_resampler_write_slot(struct chip_output_resampler* r, int slot);
void chip_output_resampler_finish_frame(struct chip_output_resampler* r);
int chip_output_resampler_samples_for_frame(const struct chip_output_resampler* r);
void chip_output_resampler_process_frame(struct chip_output_resampler* r);
double* chip_output_resampler_source(struct chip_output_resampler* r);
double* chip_output_resampler_output(struct chip_output_resampler* r);
int chip_output_resampler_max_source(void);

#endif
