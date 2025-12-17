Instructions for Junie to follow:

Orientate yourself with the repository using <repository root>/`REPOSITORY_DOCUMENTATION.md`

Use the script section of <repository root>/`package.json` to find the test commands.
The behaviour tests generate too much output for you to read, pipe it to a file.

When considering running tests, first trace the code yourself in both the test
execution path and the same path when the code is deployed to AWS and detect
and resolve bugs found through tracing before running tests.

Avoid unnecessary formatting changes when editing code.

When fixing a bug do not add "fallback" paths that allow a silent failure.

When refactoring the code, change a name everywhere, rather than "compatibility" adaptors.
