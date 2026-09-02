/* DS04 - The out-of-bounds write sits on a path that is provably unreachable:
 * the outer guard forces n < 8, so the inner `n > 16` branch can never run.
 * Expected with SMT refinement enabled: no StackBufferOverflow diagnostic.
 * Expected with --smt=off: the same code may be reported (false positive). */
#include <string.h>
#include <stdio.h>

int main(void)
{
    char buf[16];
    int n = 4;

    if (n < 8) {
        if (n > 16) {
            for (int i = 0; i < n * 8; i++)
                buf[i] = 'A';   /* line 17: unreachable */
        }
    }

    printf("%d\n", (int)sizeof(buf));
    return 0;
}
