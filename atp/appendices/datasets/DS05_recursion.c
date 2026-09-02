/* DS05 - Unbounded self-recursion with a large frame.
 * Expected: the analysis flags main as recursive / exceeding the stack limit. */
#include <stdio.h>

int main(void)
{
    char pad[65536];

    pad[0] = 1;
    printf("%d\n", (int)pad[0]);
    return main();              /* line 11: infinite self-recursion */
}
