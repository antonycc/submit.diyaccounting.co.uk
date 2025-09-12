# Increase Consistency Prompt

Analyze the current repository and identify opportunities to increase consistency across code, configuration, documentation, and processes.

Focus on:
- Standardizing coding patterns and conventions
- Consistent naming conventions across files and modules
- Unified error handling approaches
- Consistent configuration management
- Standardized testing patterns and assertions
- Uniform documentation styles and structure
- Consistent deployment and environment handling
- Aligned logging and monitoring practices

Areas to examine for consistency:
- JavaScript/TypeScript code style and formatting
- Function and variable naming conventions
- Import/export patterns and organization
- Error message formats and error handling
- Environment variable naming and usage patterns
- Test file structure and assertion styles
- Configuration file formats and organization
- Documentation structure and content style
- GitHub Actions workflow patterns and naming
- AWS resource naming and tagging conventions
- File and directory organization

Specific consistency improvements:
- Standardize async/await vs Promise patterns
- Unify HTTP status code handling
- Consistent JSON response structures
- Standardized logging levels and message formats
- Uniform parameter validation approaches
- Consistent test setup and teardown patterns
- Aligned comment and documentation styles
- Standardized dependency version management
- Consistent branch naming and commit message formats
- Unified CI/CD pipeline patterns

Provide recommendations that:
- Improve code readability and maintainability
- Reduce cognitive load for developers
- Make the codebase more predictable
- Enhance collaboration between team members
- Simplify onboarding for new contributors
- Support automated tooling and linting
- Maintain existing functionality while improving consistency

> Formatting and style: Defer to repo configs — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use npm run formatting / npm run formatting-fix. See README for details.
