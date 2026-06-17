#include <stdint.h>

static uint32_t rand_state = 1;

int rand(void) {
	rand_state = rand_state * 1103515245u + 12345u;
	return (int)((rand_state >> 16) & 32767u);
}

void srand(unsigned int seed) {
	rand_state = seed != 0 ? seed : 1;
}
