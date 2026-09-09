// bindings for ymfm
#include <emscripten/bind.h>

#include "ymfm/src/ymfm.h"
#include "ymfm/src/ymfm_opn.h"

using namespace emscripten;
using namespace ymfm;

struct ymfm_interface_wrapper : public wrapper<ymfm_interface> {
    EMSCRIPTEN_WRAPPER(ymfm_interface_wrapper);

    void ymfm_sync_mode_write(uint8_t data) {
        return call<void>("ymfm_sync_mode_write", data);
    }
    void ymfm_sync_check_interrupts() {
        return call<void>("ymfm_sync_check_interrupts");
    }
    void ymfm_set_timer(uint32_t tnum, int32_t duration_in_clocks) {
        return call<void>("ymfm_set_timer", tnum, duration_in_clocks);
    }
    void ymfm_set_busy_end(uint32_t clocks) {
        return call<void>("ymfm_set_busy_end", clocks);
    }
    bool ymfm_is_busy() {
        return call<bool>("ymfm_is_busy");
    }
    void ymfm_update_irq(bool asserted) {
        return call<void>("ymfm_update_irq", asserted);
    }
    uint8_t ymfm_external_read(access_class type, uint32_t address) {
        return call<uint8_t>("ymfm_external_read", type, address);
    }
    void ymfm_external_write(access_class type, uint32_t address, uint8_t data) {
        return call<void>("ymfm_external_write", type, address, data);
    }
};

EMSCRIPTEN_BINDINGS(ymfm) {
	class_<ymfm_interface>("ymfm_interface")
		.allow_subclass<ymfm_interface_wrapper>("ymfm_interface_wrapper")
		.function("ymfm_sync_mode_write", optional_override([](ymfm_interface& self, uint8_t data) {
            return self.ymfm_interface::ymfm_sync_mode_write(data);
        }))
		.function("ymfm_sync_check_interrupts", optional_override([](ymfm_interface& self) {
            return self.ymfm_interface::ymfm_sync_check_interrupts();
        }))
		.function("ymfm_set_timer", optional_override([](ymfm_interface& self, uint32_t tnum, int32_t duration_in_clocks) {
            return self.ymfm_interface::ymfm_set_timer(tnum, duration_in_clocks);
        }))
		.function("ymfm_set_busy_end", optional_override([](ymfm_interface& self, uint32_t clocks) {
            return self.ymfm_interface::ymfm_set_busy_end(clocks);
        }))
		.function("ymfm_is_busy", optional_override([](ymfm_interface& self) {
            return self.ymfm_interface::ymfm_is_busy();
        }))
		.function("ymfm_update_irq", optional_override([](ymfm_interface& self, bool asserted) {
            return self.ymfm_interface::ymfm_update_irq(asserted);
        }))
		.function("ymfm_external_read", optional_override([](ymfm_interface& self, access_class type, uint32_t address) {
            return self.ymfm_interface::ymfm_external_read(type, address);
        }))
		.function("ymfm_external_write", optional_override([](ymfm_interface& self, access_class type, uint32_t address, uint8_t data) {
            return self.ymfm_interface::ymfm_external_write(type, address, data);
        }))
		;
	class_<ym2203>("ym2203")
		.constructor<ymfm_interface&>()
		.function("ssg_override", &ym2203::ssg_override)
		.function("set_fidelity", &ym2203::set_fidelity)
		.function("reset", &ym2203::reset)
		.function("sample_rate", &ym2203::sample_rate)
		.function("ssg_effective_clock", &ym2203::ssg_effective_clock)
		.function("read", &ym2203::read)
		.function("write", &ym2203::write)
		.function("generate", &ym2203::generate, allow_raw_pointers())
		;
}
