#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>

/* ============================================================================
 * Large C File to Test Syntax Highlighting Performance
 * This file contains various C constructs to stress-test the highlighter
 * ============================================================================ */

#define MAX_SIZE 1000
#define MIN_SIZE 10
#define MULTIPLIER 3.14159
#define DEBUG_ENABLED 1

// Type definitions
typedef unsigned long long ull_t;
typedef struct Point Point;
typedef struct Rectangle Rectangle;
typedef struct Circle Circle;

// Enumerations
enum Color {
    RED,
    GREEN,
    BLUE,
    YELLOW,
    CYAN,
    MAGENTA,
    WHITE,
    BLACK
};

enum Status {
    SUCCESS = 0,
    ERROR_MEMORY = -1,
    ERROR_FILE = -2,
    ERROR_INVALID = -3
};

// Structure definitions
struct Point {
    double x;
    double y;
    double z;
};

struct Rectangle {
    Point top_left;
    Point bottom_right;
    enum Color color;
    bool filled;
};

struct Circle {
    Point center;
    double radius;
    enum Color color;
    bool filled;
};

// Function prototypes
int initialize_system(void);
void cleanup_system(void);
Point create_point(double x, double y, double z);
Rectangle create_rectangle(Point tl, Point br, enum Color c, bool fill);
Circle create_circle(Point center, double radius, enum Color c, bool fill);
double calculate_distance(Point a, Point b);
double calculate_rectangle_area(Rectangle rect);
double calculate_circle_area(Circle circle);
bool point_in_rectangle(Point p, Rectangle rect);
bool point_in_circle(Point p, Circle circle);

// Global variables
static int system_initialized = 0;
static uint32_t object_count = 0;
static Rectangle* rectangles[MAX_SIZE];
static Circle* circles[MAX_SIZE];

/* ============================================================================
 * Function Implementations
 * ============================================================================ */

/**
 * Initialize the graphics system
 * @return 0 on success, negative on error
 */
int initialize_system(void) {
    if (system_initialized) {
        fprintf(stderr, "System already initialized\n");
        return ERROR_INVALID;
    }
    
    // Initialize arrays
    for (int i = 0; i < MAX_SIZE; i++) {
        rectangles[i] = NULL;
        circles[i] = NULL;
    }
    
    object_count = 0;
    system_initialized = 1;
    
    printf("System initialized successfully\n");
    return SUCCESS;
}

/**
 * Cleanup and free all allocated resources
 */
void cleanup_system(void) {
    if (!system_initialized) {
        return;
    }
    
    // Free all rectangles
    for (int i = 0; i < MAX_SIZE; i++) {
        if (rectangles[i] != NULL) {
            free(rectangles[i]);
            rectangles[i] = NULL;
        }
    }
    
    // Free all circles
    for (int i = 0; i < MAX_SIZE; i++) {
        if (circles[i] != NULL) {
            free(circles[i]);
            circles[i] = NULL;
        }
    }
    
    object_count = 0;
    system_initialized = 0;
    
    printf("System cleaned up successfully\n");
}

/**
 * Create a new point
 */
Point create_point(double x, double y, double z) {
    Point p;
    p.x = x;
    p.y = y;
    p.z = z;
    return p;
}

/**
 * Create a new rectangle
 */
Rectangle create_rectangle(Point tl, Point br, enum Color c, bool fill) {
    Rectangle rect;
    rect.top_left = tl;
    rect.bottom_right = br;
    rect.color = c;
    rect.filled = fill;
    return rect;
}

/**
 * Create a new circle
 */
Circle create_circle(Point center, double radius, enum Color c, bool fill) {
    Circle circle;
    circle.center = center;
    circle.radius = radius;
    circle.color = c;
    circle.filled = fill;
    return circle;
}

/**
 * Calculate distance between two points
 */
double calculate_distance(Point a, Point b) {
    double dx = a.x - b.x;
    double dy = a.y - b.y;
    double dz = a.z - b.z;
    
    // Using sqrt from math.h (would need to link -lm)
    return dx*dx + dy*dy + dz*dz; // Simplified without sqrt
}

/**
 * Calculate rectangle area
 */
double calculate_rectangle_area(Rectangle rect) {
    double width = rect.bottom_right.x - rect.top_left.x;
    double height = rect.bottom_right.y - rect.top_left.y;
    
    if (width < 0) width = -width;
    if (height < 0) height = -height;
    
    return width * height;
}

/**
 * Calculate circle area
 */
double calculate_circle_area(Circle circle) {
    return MULTIPLIER * circle.radius * circle.radius;
}

/**
 * Check if point is inside rectangle
 */
bool point_in_rectangle(Point p, Rectangle rect) {
    double min_x = (rect.top_left.x < rect.bottom_right.x) ? 
                   rect.top_left.x : rect.bottom_right.x;
    double max_x = (rect.top_left.x > rect.bottom_right.x) ? 
                   rect.top_left.x : rect.bottom_right.x;
    double min_y = (rect.top_left.y < rect.bottom_right.y) ? 
                   rect.top_left.y : rect.bottom_right.y;
    double max_y = (rect.top_left.y > rect.bottom_right.y) ? 
                   rect.top_left.y : rect.bottom_right.y;
    
    return (p.x >= min_x && p.x <= max_x && p.y >= min_y && p.y <= max_y);
}

/**
 * Check if point is inside circle
 */
bool point_in_circle(Point p, Circle circle) {
    double dist_sq = calculate_distance(p, circle.center);
    double radius_sq = circle.radius * circle.radius;
    return (dist_sq <= radius_sq);
}

/**
 * Add a rectangle to the system
 */
int add_rectangle(Rectangle rect) {
    if (!system_initialized) {
        fprintf(stderr, "System not initialized\n");
        return ERROR_INVALID;
    }
    
    if (object_count >= MAX_SIZE) {
        fprintf(stderr, "Maximum object count reached\n");
        return ERROR_MEMORY;
    }
    
    Rectangle* new_rect = (Rectangle*)malloc(sizeof(Rectangle));
    if (new_rect == NULL) {
        fprintf(stderr, "Memory allocation failed\n");
        return ERROR_MEMORY;
    }
    
    *new_rect = rect;
    
    // Find empty slot
    for (int i = 0; i < MAX_SIZE; i++) {
        if (rectangles[i] == NULL) {
            rectangles[i] = new_rect;
            object_count++;
            return i;
        }
    }
    
    free(new_rect);
    return ERROR_MEMORY;
}

/**
 * Add a circle to the system
 */
int add_circle(Circle circle) {
    if (!system_initialized) {
        fprintf(stderr, "System not initialized\n");
        return ERROR_INVALID;
    }
    
    if (object_count >= MAX_SIZE) {
        fprintf(stderr, "Maximum object count reached\n");
        return ERROR_MEMORY;
    }
    
    Circle* new_circle = (Circle*)malloc(sizeof(Circle));
    if (new_circle == NULL) {
        fprintf(stderr, "Memory allocation failed\n");
        return ERROR_MEMORY;
    }
    
    *new_circle = circle;
    
    // Find empty slot
    for (int i = 0; i < MAX_SIZE; i++) {
        if (circles[i] == NULL) {
            circles[i] = new_circle;
            object_count++;
            return i;
        }
    }
    
    free(new_circle);
    return ERROR_MEMORY;
}

/**
 * Print statistics
 */
void print_statistics(void) {
    int rect_count = 0;
    int circle_count = 0;
    
    for (int i = 0; i < MAX_SIZE; i++) {
        if (rectangles[i] != NULL) rect_count++;
        if (circles[i] != NULL) circle_count++;
    }
    
    printf("=== System Statistics ===\n");
    printf("Total objects: %u\n", object_count);
    printf("Rectangles: %d\n", rect_count);
    printf("Circles: %d\n", circle_count);
    printf("========================\n");
}

/**
 * Main function - demonstration
 */
int main(int argc, char* argv[]) {
    printf("Graphics System Test\n");
    printf("====================\n\n");
    
    // Initialize
    if (initialize_system() != SUCCESS) {
        fprintf(stderr, "Failed to initialize system\n");
        return 1;
    }
    
    // Create some shapes
    Point p1 = create_point(0.0, 0.0, 0.0);
    Point p2 = create_point(100.0, 100.0, 0.0);
    Point center = create_point(50.0, 50.0, 0.0);
    
    Rectangle rect = create_rectangle(p1, p2, RED, true);
    Circle circle = create_circle(center, 25.0, BLUE, false);
    
    // Add shapes
    int rect_id = add_rectangle(rect);
    int circle_id = add_circle(circle);
    
    printf("Added rectangle with ID: %d\n", rect_id);
    printf("Added circle with ID: %d\n", circle_id);
    
    // Calculate areas
    double rect_area = calculate_rectangle_area(rect);
    double circle_area = calculate_circle_area(circle);
    
    printf("\nRectangle area: %.2f\n", rect_area);
    printf("Circle area: %.2f\n", circle_area);
    
    // Test point containment
    Point test_point = create_point(50.0, 50.0, 0.0);
    
    if (point_in_rectangle(test_point, rect)) {
        printf("\nTest point is inside rectangle\n");
    }
    
    if (point_in_circle(test_point, circle)) {
        printf("Test point is inside circle\n");
    }
    
    // Print statistics
    printf("\n");
    print_statistics();
    
    // Cleanup
    cleanup_system();
    
    return 0;
}
