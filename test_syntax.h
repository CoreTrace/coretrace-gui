#ifndef EXAMPLE_HEADER_H
#define EXAMPLE_HEADER_H

#include <stdint.h>
#include <stdbool.h>

// Macro definitions
#define VERSION_MAJOR 1
#define VERSION_MINOR 0
#define BUFFER_SIZE 512

// Type definitions
typedef uint32_t Address;
typedef uint8_t Byte;

// Enum definition
typedef enum {
    STATE_IDLE,
    STATE_RUNNING,
    STATE_PAUSED,
    STATE_ERROR
} SystemState;

// Structure definition
typedef struct {
    Address base_addr;
    size_t size;
    bool is_allocated;
    char name[64];
} MemoryBlock;

// Function declarations
extern int initialize_system(void);
extern void cleanup_system(void);
extern MemoryBlock* allocate_block(size_t size, const char* name);
extern void free_block(MemoryBlock* block);
extern SystemState get_system_state(void);

// Inline function
static inline bool is_valid_address(Address addr) {
    return (addr >= 0x1000 && addr < 0xFFFF);
}

// Conditional compilation
#ifdef DEBUG
    #define LOG(msg) printf("DEBUG: %s\n", msg)
#else
    #define LOG(msg)
#endif

#endif // EXAMPLE_HEADER_H
