#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_BUFFER 1024
#define PI 3.14159

// This is a single line comment
/* This is a multi-line
   comment block */

typedef struct Node {
    int data;
    char name[50];
    struct Node *next;
} Node;

int calculate_sum(int a, int b) {
    return a + b;
}

void process_data(const char *input) {
    int count = 0;
    float result = 0.0f;
    
    if (input == NULL) {
        printf("Error: NULL pointer\n");
        return;
    }
    
    for (int i = 0; i < MAX_BUFFER; i++) {
        if (input[i] == '\0') {
            break;
        }
        count++;
    }
    
    result = count * PI;
    printf("Result: %.2f\n", result);
}

int main(int argc, char *argv[]) {
    Node *head = NULL;
    int sum = 0;
    
    // Allocate memory
    head = (Node *)malloc(sizeof(Node));
    if (head == NULL) {
        fprintf(stderr, "Memory allocation failed!\n");
        return 1;
    }
    
    head->data = 42;
    strcpy(head->name, "TestNode");
    head->next = NULL;
    
    sum = calculate_sum(10, 20);
    printf("Sum: %d\n", sum);
    
    process_data("Hello, World!");
    
    // Cleanup
    free(head);
    
    return 0;
}
