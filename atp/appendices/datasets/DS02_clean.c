/* DS02 - Deliberately safe file. Expected: no diagnostic. */
#include <string.h>
#include <stdio.h>

void copy_name(const char *name)
{
    char buf[16];
    snprintf(buf, sizeof(buf), "%s", name);
    printf("%s\n", buf);
}

int main(int argc, char **argv)
{
    if (argc > 1)
        copy_name(argv[1]);
    return 0;
}
