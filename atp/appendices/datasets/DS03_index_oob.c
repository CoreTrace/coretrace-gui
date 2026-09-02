/* DS03 - Fixed off-by-one write past the end of an array.
 * Expected: out-of-bounds write reported at line 9 on `tab`. */
#include <stdio.h>

int main(void)
{
    int tab[10];
    for (int i = 0; i <= 10; i++)
        tab[i] = i;             /* line 9: i == 10 is out of bounds */
    printf("%d\n", tab[0]);
    return 0;
}
