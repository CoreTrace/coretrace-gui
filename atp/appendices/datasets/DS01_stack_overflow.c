/* DS01 - Stack buffer overflow written directly in main (the default entry
 * point of the analysis). Expected: a StackBufferOverflow diagnostic on 'buf'. */
#include <string.h>
#include <stdio.h>

int main(void)
{
    char buf[16];
    const char *src = "a string that is clearly longer than sixteen bytes";

    for (int i = 0; i <= 32; i++)
        buf[i] = src[i];        /* line 12: writes past the end of buf */

    printf("%s\n", buf);
    return 0;
}
