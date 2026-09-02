/* DS06 - C++ input. Expected: the analysis accepts a .cpp file and reports a
 * StackBufferOverflow on 'tab' at line 10. */
#include <iostream>

int main()
{
    int tab[8];

    for (int i = 0; i <= 8; i++)
        tab[i] = i;             /* line 10: i == 8 is out of bounds */

    std::cout << tab[0] << std::endl;
    return 0;
}
